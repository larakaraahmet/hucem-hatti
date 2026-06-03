#!/usr/bin/env python3
"""
ingest_openfootball.py — openfootball uluslararası maç veri yükleyici
=============================================================================

Görevler:
  1. FIFA Dünya Kupası (1930–2022) ve UEFA Avrupa Şampiyonası (2020, 2024)
     verilerini GitHub'dan indirir, wc_historical_matches tablosuna yazar.
  2. head-to-head (h2h) hesaplama fonksiyonu: iki takımın tüm uluslararası
     WC + EURO karşılaşmalarını döndürür.
  3. API endpoint için h2h_compute() dışa aktarılır.

Not: 2026 openfootball verisi eski/hatalı olduğundan atlanır; gerçek WC2026
     fikstürleri ESPN API'den alınan fixtures tablosundan çekilir.

Kullanım:
    python ingest_openfootball.py --tum          # WC 1930-2022 + Euro 2020/2024
    python ingest_openfootball.py --wc           # Sadece Dünya Kupaları
    python ingest_openfootball.py --euro         # Sadece UEFA Euro
    python ingest_openfootball.py --yil 2022     # Tek WC yılı
    python ingest_openfootball.py --h2h "Turkey" "Italy"
    python ingest_openfootball.py --istatistik
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import requests
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# ──────────────────────────────────────────────────────────────────────────────
# SABİTLER
# ──────────────────────────────────────────────────────────────────────────────

# GitHub raw URL şablonları
RAW_WC   = "https://raw.githubusercontent.com/openfootball/worldcup.json/master"
RAW_EURO = "https://raw.githubusercontent.com/openfootball/euro.json/master"

# 2026 openfootball verisi eski/yanlış — sadece 1930-2022
WC_YEARS = [
    1930, 1934, 1938, 1950, 1954, 1958,
    1962, 1966, 1970, 1974, 1978, 1982,
    1986, 1990, 1994, 1998, 2002, 2006,
    2010, 2014, 2018, 2022,
]

# UEFA Euro yılları (openfootball euro.json reposu)
EURO_YEARS = [2020, 2024]  # Euro 2020 (2021'de oynandı), Euro 2024

# Turnuva kategorisi etiketleri
TURNUVA_WC   = "FIFA Dünya Kupası"
TURNUVA_EURO = "UEFA Avrupa Şampiyonası"

# Tarihsel isim → modern isim normalleştirme
# "West Germany" WC galibiyetleri "Germany" H2H'sine dahil edilebilir.
TEAM_NORMALIZE: dict[str, str] = {
    # Almanya
    "West Germany":          "Germany",
    # Çin
    "China PR":              "China",
    # İran
    "IR Iran":               "Iran",
    # Kore
    "Korea DPR":             "North Korea",
    "Korea Republic":        "South Korea",
    # ABD
    "USA":                   "United States",
    # Hollanda
    "Holland":               "Netherlands",
    # Fildişi Sahili
    "Ivory Coast":           "Ivory Coast",
    "Côte d'Ivoire":         "Ivory Coast",
    # Türkiye (openfootball bazen farklı yazar)
    "Türkiye":               "Turkey",
    # Sırbistan ve eski Yugoslavya
    "FR Yugoslavia":         "Yugoslavia",
    "Serbia and Montenegro": "Serbia",
    # Çek/Slovak
    "Czechoslovakia":        "Czechoslovakia",  # tarihsel — aynen bırak
    # Sovyet
    "Soviet Union":          "Soviet Union",    # tarihsel — aynen bırak
    # Diğer varyasyonlar
    "Northern Ireland":      "Northern Ireland",
    "Republic of Ireland":   "Ireland",
    "Zaire":                 "DR Congo",
    "Democratic Republic of Congo": "DR Congo",
    "Congo DR":              "DR Congo",
    # Tribu kısa formları
    "UAE":                   "United Arab Emirates",
    "KSA":                   "Saudi Arabia",
    "RSA":                   "South Africa",
}

# KO tur adları İngilizce → Türkçe + sıralama indeksi
ROUND_TR: dict[str, tuple[str, int]] = {
    "round of 32":            ("Son 32",      1),
    "round of 16":            ("Son 16",      2),
    "quarter-final":          ("Çeyrek Final", 3),
    "quarter-finals":         ("Çeyrek Final", 3),
    "semi-final":             ("Yarı Final",  4),
    "semi-finals":            ("Yarı Final",  4),
    "match for third place":  ("3. Yer Maçı", 5),
    "third place play-off":   ("3. Yer Maçı", 5),
    "3rd place play-off":     ("3. Yer Maçı", 5),
    "playoff for third place":("3. Yer Maçı", 5),
    "final":                  ("Final",       6),
    # Eski turnuva formatları
    "first round":            ("1. Tur",      0),
    "second round":           ("2. Tur",      1),
    "third place":            ("3. Yer Maçı", 5),
    "play-off for third place":("3. Yer Maçı",5),
}


# ──────────────────────────────────────────────────────────────────────────────
# VERİTABANI ŞEMASI
# ──────────────────────────────────────────────────────────────────────────────

DDL = """
CREATE TABLE IF NOT EXISTS wc_historical_matches (
    id          SERIAL PRIMARY KEY,

    -- Turnuva
    yil         SMALLINT NOT NULL,

    -- Tur bilgisi
    tur         VARCHAR(80),           -- İngilizce orijinal ("Round of 16")
    tur_tr      VARCHAR(80),           -- Türkçe ("Son 16")
    tur_sira    SMALLINT,              -- Sıralama (1=Son32, 6=Final, NULL=grup)

    -- Grup aşaması
    grup        CHAR(1),               -- A,B,C... (KO için NULL)
    hafta       SMALLINT,              -- Maç günü / matchday no

    -- Tarih / saat
    tarih       DATE NOT NULL,
    tarih_utc   TIMESTAMP WITH TIME ZONE,  -- Varsa UTC datetime

    -- Takımlar
    takim1      VARCHAR(100) NOT NULL, -- Normalleştirilmiş İngilizce
    takim2      VARCHAR(100) NOT NULL,
    takim1_ham  VARCHAR(100),          -- Kaynak orijinal isim
    takim2_ham  VARCHAR(100),

    -- Skor (NULL = oynanmadı)
    gol1        SMALLINT,
    gol2        SMALLINT,
    ht_gol1     SMALLINT,
    ht_gol2     SMALLINT,

    -- Gol atanlar (JSON dizisi)
    goller1     JSONB DEFAULT '[]',
    goller2     JSONB DEFAULT '[]',

    -- Stadyum
    stadyum     VARCHAR(200),

    -- Meta
    kaynak      VARCHAR(30) DEFAULT 'openfootball',
    guncelleme  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(yil, tarih, takim1_ham, takim2_ham)
);

CREATE INDEX IF NOT EXISTS idx_wchm_yil      ON wc_historical_matches(yil);
CREATE INDEX IF NOT EXISTS idx_wchm_takim1   ON wc_historical_matches(takim1);
CREATE INDEX IF NOT EXISTS idx_wchm_takim2   ON wc_historical_matches(takim2);
CREATE INDEX IF NOT EXISTS idx_wchm_tarih    ON wc_historical_matches(tarih);
-- H2H için: her iki sırayla hızlı arama
CREATE INDEX IF NOT EXISTS idx_wchm_h2h1     ON wc_historical_matches(takim1, takim2);
CREATE INDEX IF NOT EXISTS idx_wchm_h2h2     ON wc_historical_matches(takim2, takim1);
"""


def create_table(engine) -> None:
    """Tablo ve indeksleri oluştur (idempotent)."""
    with engine.begin() as conn:
        for stmt in DDL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                conn.execute(text(stmt))
    log.info("✓ wc_historical_matches tablosu hazır.")


# ──────────────────────────────────────────────────────────────────────────────
# YARDIMCI FONKSİYONLAR
# ──────────────────────────────────────────────────────────────────────────────

def normalize_team(name: str, apply: bool = True) -> str:
    """
    Takım ismini normalleştirir.
    apply=False: orijinal ismi döndürür (ham depolama için).
    """
    if not apply:
        return name
    return TEAM_NORMALIZE.get(name, name)


def parse_time_utc(date_str: str, time_str: Optional[str]) -> Optional[datetime]:
    """
    Tarih + saat string'inden UTC-aware datetime üretir.

    Desteklenen formatlar:
      - "HH:MM UTC+N" / "HH:MM UTC-N"  (örn. "13:00 UTC-6")
      - "HH:MM"  (naif — UTC olarak kabul edilir)
      - time_str None ise sadece tarih (gece yarısı UTC)
    """
    try:
        base = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return None

    if not time_str:
        return base.replace(tzinfo=timezone.utc)

    # "HH:MM UTC±N" veya "HH:MM UTC±NN"
    m = re.match(r"(\d{1,2}):(\d{2})\s*UTC([+-]\d+)", time_str.strip())
    if m:
        h, mn, off = int(m.group(1)), int(m.group(2)), int(m.group(3))
        tz_offset = timezone(timedelta(hours=off))
        local_dt = base.replace(hour=h, minute=mn, tzinfo=tz_offset)
        return local_dt.astimezone(timezone.utc)

    # Sadece "HH:MM"
    m = re.match(r"(\d{1,2}):(\d{2})", time_str.strip())
    if m:
        h, mn = int(m.group(1)), int(m.group(2))
        return base.replace(hour=h, minute=mn, tzinfo=timezone.utc)

    return base.replace(tzinfo=timezone.utc)


def parse_round(round_str: str, group_val: Optional[str]) -> dict:
    """
    Round string'ini ayrıştırır.
    Döndürür: {tur, tur_tr, tur_sira, grup, hafta, is_group}
    """
    rs = round_str.strip()
    rs_lower = rs.lower()

    # Grup maçı: "Matchday N"
    md = re.match(r"matchday\s+(\d+)", rs_lower)
    if md:
        hafta = int(md.group(1))
        grup = group_val.replace("Group ", "") if group_val else None
        return {
            "tur":      rs,
            "tur_tr":   f"Grup - Maç Günü {hafta}",
            "tur_sira": None,
            "grup":     grup,
            "hafta":    hafta,
            "is_group": True,
        }

    # Eski format: "First Round", "Second Round" vs.
    for eng, (tr, sira) in ROUND_TR.items():
        if rs_lower == eng or rs_lower.startswith(eng):
            # Eğer gruba ait bir "First Round" ise grup aşaması sayılır
            grup = group_val.replace("Group ", "") if group_val else None
            is_grp = grup is not None and sira == 0
            return {
                "tur":      rs,
                "tur_tr":   tr,
                "tur_sira": None if is_grp else sira,
                "grup":     grup if is_grp else None,
                "hafta":    None,
                "is_group": is_grp,
            }

    # Bilinmeyen format — genel
    grup = group_val.replace("Group ", "") if group_val else None
    return {
        "tur":      rs,
        "tur_tr":   rs,  # Çevirisi yok, orijinal bırak
        "tur_sira": None,
        "grup":     grup,
        "hafta":    None,
        "is_group": grup is not None,
    }


def is_real_team(name: str) -> bool:
    """
    Takım isminin gerçek bir takım mı yoksa yer tutucu mu olduğunu kontrol eder.
    Yer tutucular: "1A", "2B", "W1", "QW3", "SF1", vs.
    """
    return not bool(re.match(r"^[0-9WwQqSs]", name.strip()))


# ──────────────────────────────────────────────────────────────────────────────
# VERİ ÇEKME VE PARSE
# ──────────────────────────────────────────────────────────────────────────────

def fetch_json(url: str, timeout: int = 30) -> Optional[dict]:
    """GitHub'dan JSON dosyasını indirir."""
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.json()
    except requests.RequestException as e:
        log.warning(f"  İndirilemedi ({url}): {e}")
        return None


def fetch_wc_json(year: int) -> Optional[dict]:
    return fetch_json(f"{RAW_WC}/{year}/worldcup.json")


def fetch_euro_json(year: int) -> Optional[dict]:
    return fetch_json(f"{RAW_EURO}/{year}/euro.json")


def parse_match(raw: dict, year: int, turnuva_kategori: str = TURNUVA_WC) -> Optional[dict]:
    """
    Tek bir openfootball maç kaydını ayrıştırır.
    Gerçek takım ismi olmayan (yer tutucu) kayıtları None döndürür.
    """
    t1_raw = raw.get("team1", "")
    t2_raw = raw.get("team2", "")

    # Yer tutucu takım ismi → atla
    if not t1_raw or not t2_raw:
        return None
    if not is_real_team(t1_raw) or not is_real_team(t2_raw):
        return None

    t1 = normalize_team(t1_raw)
    t2 = normalize_team(t2_raw)

    # Tarih + saat
    date_str  = raw.get("date", "")
    time_str  = raw.get("time")
    tarih_utc = parse_time_utc(date_str, time_str)
    try:
        tarih = date.fromisoformat(date_str) if date_str else None
    except ValueError:
        tarih = None

    if not tarih:
        return None

    # Tur / grup
    round_info = parse_round(raw.get("round", ""), raw.get("group"))

    # Skor
    score = raw.get("score", {})
    ft = score.get("ft") if score else None
    ht = score.get("ht") if score else None
    gol1 = ft[0] if ft and len(ft) == 2 else None
    gol2 = ft[1] if ft and len(ft) == 2 else None
    ht_gol1 = ht[0] if ht and len(ht) == 2 else None
    ht_gol2 = ht[1] if ht and len(ht) == 2 else None

    # Goller JSON
    goller1 = json.dumps(raw.get("goals1", []), ensure_ascii=False)
    goller2 = json.dumps(raw.get("goals2", []), ensure_ascii=False)

    return {
        "yil":       year,
        "tur":       round_info["tur"],
        "tur_tr":    round_info["tur_tr"],
        "tur_sira":  round_info["tur_sira"],
        "grup":      round_info["grup"],
        "hafta":     round_info["hafta"],
        "tarih":     tarih,
        "tarih_utc": tarih_utc,
        "takim1":    t1,
        "takim2":    t2,
        "takim1_ham":t1_raw,
        "takim2_ham":t2_raw,
        "gol1":      gol1,
        "gol2":      gol2,
        "ht_gol1":   ht_gol1,
        "ht_gol2":   ht_gol2,
        "goller1":          goller1,
        "goller2":          goller2,
        "stadyum":          raw.get("ground"),
        "turnuva_kategori": turnuva_kategori,
    }


# ──────────────────────────────────────────────────────────────────────────────
# DB YAZMA
# ──────────────────────────────────────────────────────────────────────────────

UPSERT_SQL = text("""
    INSERT INTO wc_historical_matches
        (yil, tur, tur_tr, tur_sira, grup, hafta,
         tarih, tarih_utc,
         takim1, takim2, takim1_ham, takim2_ham,
         gol1, gol2, ht_gol1, ht_gol2,
         goller1, goller2, stadyum, turnuva_kategori)
    VALUES
        (:yil, :tur, :tur_tr, :tur_sira, :grup, :hafta,
         :tarih, :tarih_utc,
         :takim1, :takim2, :takim1_ham, :takim2_ham,
         :gol1, :gol2, :ht_gol1, :ht_gol2,
         CAST(:goller1 AS jsonb), CAST(:goller2 AS jsonb),
         :stadyum, :turnuva_kategori)
    ON CONFLICT (yil, tarih, takim1_ham, takim2_ham) DO UPDATE SET
        tur               = EXCLUDED.tur,
        tur_tr            = EXCLUDED.tur_tr,
        tur_sira          = EXCLUDED.tur_sira,
        grup              = EXCLUDED.grup,
        hafta             = EXCLUDED.hafta,
        tarih_utc         = EXCLUDED.tarih_utc,
        takim1            = EXCLUDED.takim1,
        takim2            = EXCLUDED.takim2,
        gol1              = EXCLUDED.gol1,
        gol2              = EXCLUDED.gol2,
        ht_gol1           = EXCLUDED.ht_gol1,
        ht_gol2           = EXCLUDED.ht_gol2,
        goller1           = EXCLUDED.goller1,
        goller2           = EXCLUDED.goller2,
        stadyum           = EXCLUDED.stadyum,
        turnuva_kategori  = EXCLUDED.turnuva_kategori,
        guncelleme        = NOW()
""")


def load_year(
    engine,
    year: int,
    fetch_fn=None,
    turnuva_kategori: str = TURNUVA_WC,
    etiket: str = "",
) -> int:
    """
    Tek bir turnuva yılını indir ve yükle.
    fetch_fn: yıl → dict döndüren fonksiyon (varsayılan: fetch_wc_json)
    """
    if fetch_fn is None:
        fetch_fn = fetch_wc_json

    tag = etiket or turnuva_kategori
    log.info(f"\n  [{year}] {tag} indiriliyor…")
    data = fetch_fn(year)
    if not data:
        return 0

    matches_raw = data.get("matches", [])
    log.info(f"  [{year}] {len(matches_raw)} ham kayıt, ayrıştırılıyor…")

    ok = skipped = 0
    with engine.begin() as conn:
        for raw in matches_raw:
            row = parse_match(raw, year, turnuva_kategori=turnuva_kategori)
            if row is None:
                skipped += 1
                continue
            try:
                conn.execute(UPSERT_SQL, row)
                ok += 1
            except Exception as e:
                log.debug(f"  [{year}] Yazma hatası: {e} | {raw}")
                skipped += 1

    log.info(f"  [{year}] ✓ {ok} maç yazıldı, {skipped} atlandı.")
    return ok


def load_all(engine, years: Optional[list[int]] = None, delay: float = 0.4) -> int:
    """WC + Euro + WC2026 playoff tümünü yükle."""
    create_table(engine)
    total  = _load_wc(engine, years, delay)
    total += _load_euro(engine, delay=delay)
    total += load_wc2026_playoffs(engine)
    log.info(f"\n✅ GENEL TOPLAM: {total} maç yüklendi.")
    return total


def load_wc2026_playoffs(engine) -> int:
    """
    WC 2026 kualifikasyon playoff maçlarını yükler.
    Kaynak: openfootball/worldcup.json/master/2026/worldcup.quali_playoffs.json
    UEFA Second Round Play-offs (Path A-D) + Inter-confederation Play-offs.
    """
    TURNUVA_PLAYOFF = "WC 2026 Playoff"
    url = f"{RAW_WC}/2026/worldcup.quali_playoffs.json"
    log.info(f"  WC 2026 Playoff indiriliyor: {url}")

    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        log.error(f"  Playoff verisi indirilemedi: {e}")
        return 0

    matches = data.get("matches", [])
    if not matches:
        log.warning("  Playoff verisi boş.")
        return 0

    count = 0
    create_table(engine)
    with engine.begin() as conn:
        for raw in matches:
            # parse_match fonksiyonu playoff maçlarını da işleyebilir
            parsed = parse_match(raw, year=2026, turnuva_kategori=TURNUVA_PLAYOFF)
            if not parsed:
                continue
            # Tur bilgisini round alanından doldur (parse_match atlamış olabilir)
            if not parsed["tur_tr"]:
                parsed["tur_tr"] = raw.get("round", "Playoff")
            try:
                conn.execute(UPSERT_SQL, parsed)
                count += 1
            except Exception as e:
                log.debug(f"  Playoff satır atlandı: {e}")

    log.info(f"  WC 2026 Playoff: {count} maç yüklendi.")
    return count


def _load_wc(engine, years: Optional[list[int]] = None, delay: float = 0.4) -> int:
    """FIFA Dünya Kupası yıllarını yükle (1930-2022)."""
    create_table(engine)
    target = years or WC_YEARS
    total = 0
    for year in target:
        n = load_year(engine, year,
                      fetch_fn=fetch_wc_json,
                      turnuva_kategori=TURNUVA_WC,
                      etiket="FIFA WC")
        total += n
        if year != target[-1]:
            time.sleep(delay)
    log.info(f"\n✅ Dünya Kupası: {total} maç ({len(target)} turnuva).")
    return total


def _load_euro(engine, years: Optional[list[int]] = None, delay: float = 0.4) -> int:
    """UEFA Avrupa Şampiyonası yıllarını yükle."""
    create_table(engine)
    target = years or EURO_YEARS
    total = 0
    for year in target:
        n = load_year(engine, year,
                      fetch_fn=fetch_euro_json,
                      turnuva_kategori=TURNUVA_EURO,
                      etiket="UEFA Euro")
        total += n
        if year != target[-1]:
            time.sleep(delay)
    log.info(f"\n✅ UEFA Euro: {total} maç ({len(target)} turnuva).")
    return total


# ──────────────────────────────────────────────────────────────────────────────
# H2H HESAPLAMA
# ──────────────────────────────────────────────────────────────────────────────

def h2h_compute(
    engine,
    takim1: str,
    takim2: str,
    normalize: bool = True,
    min_yil: int = 1930,
    max_yil: int = 2026,
) -> dict:
    """
    İki takım arasındaki tüm Dünya Kupası geçmişini hesaplar.

    Kaynaklar:
      1. wc_historical_matches (1930-2022, openfootball)
      2. fixtures tablosu — 2026 oynandı maçlar (gerçek zamanlı güncelleme)

    Döndürür:
    {
        "takim1": str, "takim2": str,
        "toplam_mac": int,
        "takim1_galibiyet": int, "takim2_galibiyet": int, "beraberlik": int,
        "takim1_gol": int, "takim2_gol": int,
        "son_5": [...],
        "tum_maclar": [
            {
                "yil": int, "tarih": str, "tur_tr": str,
                "takim1": str, "takim2": str,
                "gol1": int|null, "gol2": int|null,
                "kazanan": str|null,
                "stadyum": str|null
            }
        ]
    }
    """
    if normalize:
        t1 = normalize_team(takim1)
        t2 = normalize_team(takim2)
    else:
        t1, t2 = takim1, takim2

    # ── 1. wc_historical_matches'ten çek ─────────────────────────────────────
    hist_sql = text("""
        SELECT
            yil,
            tarih::text          AS tarih,
            tur_tr,
            tur_sira,
            grup,
            turnuva_kategori,
            takim1               AS team1,
            takim2               AS team2,
            gol1,
            gol2,
            ht_gol1,
            ht_gol2,
            goller1,
            goller2,
            stadyum
        FROM wc_historical_matches
        WHERE
            yil BETWEEN :min_yil AND :max_yil
            AND (
                (takim1 = :t1 AND takim2 = :t2)
                OR (takim1 = :t2 AND takim2 = :t1)
            )
        ORDER BY tarih ASC, yil ASC
    """)

    # ── 2. 2026 oynandı fikstürler ────────────────────────────────────────────
    fix_sql = text("""
        SELECT
            2026                 AS yil,
            (tarih_utc AT TIME ZONE 'UTC')::date::text  AS tarih,
            tur                  AS tur_tr,
            NULL::smallint       AS tur_sira,
            grup,
            ev_takim             AS team1,
            dep_takim            AS team2,
            ev_gol               AS gol1,
            dep_gol              AS gol2,
            NULL::jsonb          AS goller1,
            NULL::jsonb          AS goller2,
            stadyum_isim         AS stadyum
        FROM fixtures
        WHERE durum = 'oynandı'
          AND (
              (ev_takim  ILIKE :t1 AND dep_takim ILIKE :t2)
              OR (ev_takim ILIKE :t2 AND dep_takim ILIKE :t1)
          )
        ORDER BY tarih_utc ASC
    """)

    with engine.connect() as conn:
        hist_rows  = conn.execute(hist_sql, {"t1": t1, "t2": t2,
                                              "min_yil": min_yil, "max_yil": max_yil}).mappings().fetchall()
        fix_rows   = conn.execute(fix_sql,  {"t1": t1, "t2": t2}).mappings().fetchall()

    # ── Birleştir ─────────────────────────────────────────────────────────────
    all_rows = list(hist_rows) + list(fix_rows)

    # ── Satırları dict'e çevir + kazanan hesapla ──────────────────────────────
    matches: list[dict] = []
    for r in all_rows:
        gol1 = r["gol1"]
        gol2 = r["gol2"]
        played = gol1 is not None and gol2 is not None

        # Bakış açısı: t1 her zaman "takim1" gibi görünsün
        if r["team1"] == t1 or r["team1"].lower() == t1.lower():
            t1_gol, t2_gol = gol1, gol2
        else:
            t1_gol, t2_gol = gol2, gol1

        if not played:
            kazanan = None
        elif t1_gol > t2_gol:
            kazanan = t1
        elif t2_gol > t1_gol:
            kazanan = t2
        else:
            kazanan = "beraberlik"

        # Gol atanları bakış açısına göre yeniden düzenle
        raw_g1 = r.get("goller1") or []
        raw_g2 = r.get("goller2") or []
        if isinstance(raw_g1, str):
            raw_g1 = json.loads(raw_g1)
        if isinstance(raw_g2, str):
            raw_g2 = json.loads(raw_g2)

        if r["team1"] == t1 or (r["team1"] or "").lower() == t1.lower():
            t1_goller, t2_goller = raw_g1, raw_g2
            ht1, ht2 = r.get("ht_gol1"), r.get("ht_gol2")
        else:
            t1_goller, t2_goller = raw_g2, raw_g1
            ht1, ht2 = r.get("ht_gol2"), r.get("ht_gol1")

        matches.append({
            "yil":              r["yil"],
            "tarih":            r["tarih"],
            "tur_tr":           r["tur_tr"] or "",
            "grup":             r["grup"],
            "turnuva_kategori": r.get("turnuva_kategori") or TURNUVA_WC,
            "takim1":           t1,
            "takim2":           t2,
            "gol1":             t1_gol,
            "gol2":             t2_gol,
            "ht_gol1":          ht1,
            "ht_gol2":          ht2,
            "goller1":          t1_goller,
            "goller2":          t2_goller,
            "kazanan":          kazanan,
            "stadyum":          r["stadyum"],
        })

    # ── Aggregate istatistikler ───────────────────────────────────────────────
    played_matches = [m for m in matches if m["gol1"] is not None]

    t1_win = sum(1 for m in played_matches if m["kazanan"] == t1)
    t2_win = sum(1 for m in played_matches if m["kazanan"] == t2)
    ber    = sum(1 for m in played_matches if m["kazanan"] == "beraberlik")
    t1_gol_total = sum(m["gol1"] or 0 for m in played_matches)
    t2_gol_total = sum(m["gol2"] or 0 for m in played_matches)

    return {
        "takim1":            t1,
        "takim2":            t2,
        "toplam_mac":        len(played_matches),
        "takim1_galibiyet":  t1_win,
        "takim2_galibiyet":  t2_win,
        "beraberlik":        ber,
        "takim1_gol":        t1_gol_total,
        "takim2_gol":        t2_gol_total,
        "son_5":             matches[-5:] if matches else [],
        "tum_maclar":        matches,
    }


# ──────────────────────────────────────────────────────────────────────────────
# TABLO İSTATİSTİĞİ
# ──────────────────────────────────────────────────────────────────────────────

def print_istatistik(engine) -> None:
    sql = text("""
        SELECT
            yil,
            COUNT(*)                                     AS mac_sayisi,
            SUM(CASE WHEN gol1 IS NOT NULL THEN 1 END)   AS oynandi,
            COUNT(DISTINCT takim1) + COUNT(DISTINCT takim2) AS takim_sayisi
        FROM wc_historical_matches
        GROUP BY yil
        ORDER BY yil
    """)
    with engine.connect() as conn:
        rows = conn.execute(sql).fetchall()

    print(f"\n{'Yıl':>6}  {'Toplam':>8}  {'Oynandı':>8}  {'Takım~':>8}")
    print("-" * 40)
    total_m = total_p = 0
    for r in rows:
        print(f"{r[0]:>6}  {r[1]:>8}  {r[2] or 0:>8}  {r[3]:>8}")
        total_m += r[1]
        total_p += (r[2] or 0)
    print("-" * 40)
    print(f"{'TOPLAM':>6}  {total_m:>8}  {total_p:>8}")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="openfootball WC verisi yükleyici + H2H hesaplayıcı"
    )
    parser.add_argument("--tum",         action="store_true",
                        help="WC 1930-2022 + Euro 2020/2024 + WC2026 playoff tümünü yükle")
    parser.add_argument("--playoff",     action="store_true",
                        help="WC 2026 kualifikasyon playoff maçlarını yükle")
    parser.add_argument("--wc",          action="store_true",
                        help="Sadece FIFA Dünya Kupaları (1930-2022)")
    parser.add_argument("--euro",        action="store_true",
                        help="Sadece UEFA Avrupa Şampiyonası (2020, 2024)")
    parser.add_argument("--yil",         type=int, metavar="YIL",
                        help="Tek bir WC yılı yükle (ör. 2022)")
    parser.add_argument("--yillar",      type=str, metavar="YIL1,YIL2",
                        help="Belirli WC yılları (ör. 2018,2022)")
    parser.add_argument("--h2h",         nargs=2, metavar=("TAKIM1", "TAKIM2"),
                        help="H2H hesapla (ör. --h2h Germany France)")
    parser.add_argument("--normalize",   action="store_true", default=True,
                        help="H2H'de takım isimlerini normalleştir (varsayılan: açık)")
    parser.add_argument("--no-normalize",action="store_true",
                        help="H2H'de normalleştirmeyi kapat")
    parser.add_argument("--istatistik",  action="store_true",
                        help="Yüklü veri özeti")
    parser.add_argument("--create-table",action="store_true",
                        help="Sadece tabloyu oluştur")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.create_table:
        create_table(engine)
        return

    if args.tum:
        load_all(engine)
        return

    if args.wc:
        _load_wc(engine)
        return

    if args.euro:
        _load_euro(engine)
        return

    if args.playoff:
        create_table(engine)
        load_wc2026_playoffs(engine)
        return

    if args.yil:
        create_table(engine)
        load_year(engine, args.yil, fetch_fn=fetch_wc_json, turnuva_kategori=TURNUVA_WC)
        return

    if args.yillar:
        years = [int(y.strip()) for y in args.yillar.split(",")]
        _load_wc(engine, years)
        return

    if args.h2h:
        t1, t2 = args.h2h
        normalize = not args.no_normalize
        result = h2h_compute(engine, t1, t2, normalize=normalize)
        print(json.dumps(result, indent=2, ensure_ascii=False, default=str))
        return

    if args.istatistik:
        print_istatistik(engine)
        return

    # Varsayılan: tümünü yükle
    log.info("Argüman verilmedi — tüm yıllar yükleniyor (--help ile seçenekleri gör)")
    load_all(engine)


if __name__ == "__main__":
    main()
