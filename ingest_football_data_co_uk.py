#!/usr/bin/env python3
"""
ingest_football_data_co_uk.py — football-data.co.uk geçmiş maç sonuçları yükleyici
====================================================================================

football-data.co.uk'dan Big 5 Avrupa ligi geçmiş sezon CSV'lerini indirir ve
club_historical_matches tablosuna yazar (H2H + model eğitimi için).

Veri yapısı:
  Maç bazlı: tarih, ev/deplasman takım, FT skor, HT skor, bahis oranları
  NOT: Oyuncu verisi içermez, yalnızca maç sonuçları.

Kullanım:
  python ingest_football_data_co_uk.py                       # tüm ligler, son 5 sezon
  python ingest_football_data_co_uk.py --lig EPL             # tek lig
  python ingest_football_data_co_uk.py --sezon 5             # son N sezon
  python ingest_football_data_co_uk.py --h2h "Arsenal" "Chelsea"  # kulüp H2H
  python ingest_football_data_co_uk.py --rapor               # doluluk raporu
  python ingest_football_data_co_uk.py --create-table        # tabloyu oluştur
"""

import argparse
import io
import logging
import os
import sys
import time
from typing import Optional

import pandas as pd
import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# ── Lig ve sezon konfigürasyonu ──────────────────────────────────────────────

LIGLER = {
    #  Kısa ad  : (dosya_kodu, uzun_ad)
    "EPL":        ("E0",  "Premier League"),
    "Championship": ("E1", "Championship"),
    "LaLiga":     ("SP1", "La Liga"),
    "Bundesliga": ("D1",  "Bundesliga"),
    "SerieA":     ("I1",  "Serie A"),
    "Ligue1":     ("F1",  "Ligue 1"),
}

BASE_URL = "https://www.football-data.co.uk/mmz4281"
HEADERS  = {"User-Agent": "Mozilla/5.0 (personal/learning project)"}
REQUEST_DELAY = 2.0  # saniye

# Sezon kodu: 2024/25 → "2425", 2023/24 → "2324", ...
def sezon_kodu(yil: int) -> str:
    return f"{str(yil)[-2:]}{str(yil+1)[-2:]}"

def sezon_str(yil: int) -> str:
    return f"{yil}/{str(yil+1)[-2:]}"

# ── CSV indirme ──────────────────────────────────────────────────────────────

def download_csv(lig_kodu: str, sezon_yil: int) -> Optional[pd.DataFrame]:
    """
    Belirtilen lig ve sezon için football-data.co.uk CSV'sini indirir.
    """
    kod    = sezon_kodu(sezon_yil)
    url    = f"{BASE_URL}/{kod}/{lig_kodu}.csv"
    try:
        r = requests.get(url, headers=HEADERS, timeout=15)
        if r.status_code == 404:
            log.warning(f"  Bulunamadı: {url}")
            return None
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text), encoding="latin-1", low_memory=False)
        # Boş satırları temizle
        df = df.dropna(subset=["HomeTeam", "AwayTeam"])
        log.info(f"  ✓ {url} — {len(df)} maç")
        return df
    except requests.RequestException as e:
        log.error(f"  İndirme hatası ({url}): {e}")
        return None
    except Exception as e:
        log.error(f"  CSV okuma hatası: {e}")
        return None


# ── Tablo oluşturma ──────────────────────────────────────────────────────────

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS club_historical_matches (
    id              SERIAL PRIMARY KEY,
    tarih           DATE NOT NULL,
    lig             VARCHAR(60)  NOT NULL,
    sezon           VARCHAR(10)  NOT NULL,
    ev_takim        VARCHAR(100) NOT NULL,
    dep_takim       VARCHAR(100) NOT NULL,
    ev_gol          SMALLINT,
    dep_gol         SMALLINT,
    ht_ev_gol       SMALLINT,
    ht_dep_gol      SMALLINT,
    sonuc           CHAR(1),       -- H/D/A
    -- Bahis oranları (opsiyonel, model eğitimi için)
    b365_ev         NUMERIC(6,2),
    b365_ber        NUMERIC(6,2),
    b365_dep        NUMERIC(6,2),
    kaynak          VARCHAR(30) DEFAULT 'football-data.co.uk',
    UNIQUE (tarih, lig, ev_takim, dep_takim)
);
CREATE INDEX IF NOT EXISTS idx_chm_takim    ON club_historical_matches (ev_takim, dep_takim);
CREATE INDEX IF NOT EXISTS idx_chm_lig      ON club_historical_matches (lig, sezon);
CREATE INDEX IF NOT EXISTS idx_chm_tarih    ON club_historical_matches (tarih);
"""

def create_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text(CREATE_TABLE_SQL))
    log.info("  club_historical_matches tablosu hazır.")


# ── Veri yükleme ─────────────────────────────────────────────────────────────

UPSERT_SQL = """
    INSERT INTO club_historical_matches
      (tarih, lig, sezon, ev_takim, dep_takim,
       ev_gol, dep_gol, ht_ev_gol, ht_dep_gol, sonuc,
       b365_ev, b365_ber, b365_dep)
    VALUES
      (:tarih, :lig, :sezon, :ev_takim, :dep_takim,
       :ev_gol, :dep_gol, :ht_ev_gol, :ht_dep_gol, :sonuc,
       :b365_ev, :b365_ber, :b365_dep)
    ON CONFLICT (tarih, lig, ev_takim, dep_takim)
    DO UPDATE SET
      ev_gol     = EXCLUDED.ev_gol,
      dep_gol    = EXCLUDED.dep_gol,
      ht_ev_gol  = EXCLUDED.ht_ev_gol,
      ht_dep_gol = EXCLUDED.ht_dep_gol,
      sonuc      = EXCLUDED.sonuc,
      b365_ev    = EXCLUDED.b365_ev,
      b365_ber   = EXCLUDED.b365_ber,
      b365_dep   = EXCLUDED.b365_dep
"""

def parse_date(date_str: str) -> Optional[str]:
    """DD/MM/YY veya DD/MM/YYYY → YYYY-MM-DD"""
    if not date_str or pd.isna(date_str):
        return None
    for fmt in ("%d/%m/%y", "%d/%m/%Y"):
        try:
            return pd.to_datetime(date_str, format=fmt).strftime("%Y-%m-%d")
        except Exception:
            continue
    return None

def safe_int(val) -> Optional[int]:
    try:
        return int(float(val))
    except Exception:
        return None

def safe_float(val) -> Optional[float]:
    try:
        return round(float(val), 2)
    except Exception:
        return None


def load_df(engine, df: pd.DataFrame, lig_tr: str, sezon_yil: int) -> int:
    """DataFrame'i club_historical_matches tablosuna yükler. Yüklenen satır sayısını döndürür."""
    sezon   = sezon_str(sezon_yil)
    inserted = 0

    with engine.begin() as conn:
        for _, row in df.iterrows():
            tarih = parse_date(str(row.get("Date", "")))
            if not tarih:
                continue

            ev_gol  = safe_int(row.get("FTHG") or row.get("HG"))
            dep_gol = safe_int(row.get("FTAG") or row.get("AG"))
            sonuc   = str(row.get("FTR") or row.get("Res") or "").strip().upper() or None

            ht_ev  = safe_int(row.get("HTHG"))
            ht_dep = safe_int(row.get("HTAG"))

            b365_ev  = safe_float(row.get("B365H"))
            b365_ber = safe_float(row.get("B365D"))
            b365_dep = safe_float(row.get("B365A"))

            try:
                conn.execute(text(UPSERT_SQL), {
                    "tarih":     tarih,
                    "lig":       lig_tr,
                    "sezon":     sezon,
                    "ev_takim":  str(row.get("HomeTeam", "")).strip(),
                    "dep_takim": str(row.get("AwayTeam", "")).strip(),
                    "ev_gol":    ev_gol,
                    "dep_gol":   dep_gol,
                    "ht_ev_gol": ht_ev,
                    "ht_dep_gol": ht_dep,
                    "sonuc":     sonuc,
                    "b365_ev":   b365_ev,
                    "b365_ber":  b365_ber,
                    "b365_dep":  b365_dep,
                })
                inserted += 1
            except Exception as e:
                log.debug(f"  Satır atlandı: {e}")

    return inserted


def run_ingest(
    engine,
    ligler_filtre: Optional[list[str]] = None,
    n_sezon: int = 5,
) -> None:
    """Tüm seçili ligler ve son N sezon için CSV'leri indir ve yükle."""
    # Sezon yılları: örn. 2024=2024/25, 2023=2023/24, ...
    import datetime
    bugun   = datetime.date.today()
    maks_yil = bugun.year - 1  # sezon bitmişse dahil et
    sezonlar = list(range(maks_yil, maks_yil - n_sezon, -1))

    toplam = 0
    for kis_ad, (dosya_kodu, lig_tr) in LIGLER.items():
        if ligler_filtre and kis_ad not in ligler_filtre:
            continue
        for yil in sezonlar:
            df = download_csv(dosya_kodu, yil)
            if df is None:
                continue
            n = load_df(engine, df, lig_tr, yil)
            log.info(f"  → {lig_tr} {sezon_str(yil)}: {n} satır eklendi/güncellendi")
            toplam += n
            time.sleep(REQUEST_DELAY)

    log.info(f"\n  Toplam {toplam} maç kaydı yüklendi.")


# ── Kulüp H2H fonksiyonu ─────────────────────────────────────────────────────

def h2h_kulupler(
    engine,
    takim1: str,
    takim2: str,
    lig: Optional[str] = None,
    min_sezon: Optional[str] = None,
) -> dict:
    """
    İki kulüp arasındaki karşılaşma geçmişini döndürür.
    (football-data.co.uk kaynaklı club_historical_matches tablosundan)

    Returns dict:
      takim1, takim2, toplam_mac, t1_galibiyet, t2_galibiyet, beraberlik,
      t1_gol, t2_gol, son_maclar: [...]
    """
    params: dict = {"t1": takim1, "t2": takim2}
    where = """
        WHERE (
            (LOWER(ev_takim)  = LOWER(:t1) AND LOWER(dep_takim) = LOWER(:t2))
         OR (LOWER(ev_takim)  = LOWER(:t2) AND LOWER(dep_takim) = LOWER(:t1))
        )
    """
    if lig:
        where += " AND lig = :lig"
        params["lig"] = lig
    if min_sezon:
        where += " AND sezon >= :ms"
        params["ms"] = min_sezon

    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT tarih, lig, sezon, ev_takim, dep_takim,
                   ev_gol, dep_gol, ht_ev_gol, ht_dep_gol, sonuc
            FROM club_historical_matches
            {where}
            ORDER BY tarih DESC
        """), params).fetchall()

    if not rows:
        return {"takim1": takim1, "takim2": takim2, "toplam_mac": 0}

    t1_gal = t2_gal = ber = t1_gol = t2_gol = 0
    maclar = []

    for r in rows:
        ev, dep = r[3], r[4]
        eg, dg  = r[5], r[6]
        if eg is None or dg is None:
            continue

        t1_ev = ev.lower() == takim1.lower()
        gol1  = eg if t1_ev else dg
        gol2  = dg if t1_ev else eg
        t1_gol += gol1; t2_gol += gol2

        if gol1 > gol2:
            t1_gal += 1; kaz = takim1
        elif gol2 > gol1:
            t2_gal += 1; kaz = takim2
        else:
            ber += 1;    kaz = "beraberlik"

        maclar.append({
            "tarih":  str(r[0]), "lig": r[1], "sezon": r[2],
            "ev_takim": ev, "dep_takim": dep,
            "gol1": gol1, "gol2": gol2,
            "ht_gol1": r[6] if not t1_ev else r[7],
            "ht_gol2": r[7] if not t1_ev else r[6],
            "kazanan": kaz,
        })

    return {
        "takim1":          takim1,
        "takim2":          takim2,
        "toplam_mac":      len(maclar),
        "takim1_galibiyet": t1_gal,
        "takim2_galibiyet": t2_gal,
        "beraberlik":      ber,
        "takim1_gol":      t1_gol,
        "takim2_gol":      t2_gol,
        "son_5":           maclar[:5],
        "tum_maclar":      maclar,
    }


# ── Rapor ────────────────────────────────────────────────────────────────────

def rapor(engine) -> None:
    """Yüklenen kulüp maç verisi özeti."""
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT lig, sezon, COUNT(*) AS mac
                FROM club_historical_matches
                GROUP BY lig, sezon
                ORDER BY lig, sezon DESC
            """)).fetchall()
            toplam = conn.execute(text(
                "SELECT COUNT(*) FROM club_historical_matches"
            )).scalar()
    except Exception:
        print("  club_historical_matches tablosu yok — önce --create-table çalıştır.")
        return

    if not rows:
        print("  Henüz veri yok — önce: python ingest_football_data_co_uk.py")
        return

    print(f"\n{'Lig':<22} {'Sezon':<8} {'Maç':>5}")
    print("-" * 38)
    for r in rows:
        print(f"{str(r[0]):<22} {str(r[1]):<8} {r[2]:>5}")
    print("-" * 38)
    print(f"{'TOPLAM':<22} {'':<8} {toplam:>5}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="football-data.co.uk kulüp maç geçmişi yükleyici"
    )
    parser.add_argument("--lig",         type=str, nargs="+", metavar="KOD",
                        help=f"Ligler: {', '.join(LIGLER)}")
    parser.add_argument("--sezon",       type=int, metavar="N", default=5,
                        help="Son kaç sezon (varsayılan: 5)")
    parser.add_argument("--h2h",         type=str, nargs=2, metavar=("TAKIM1", "TAKIM2"),
                        help="İki kulüp arasında H2H hesapla")
    parser.add_argument("--h2h-lig",     type=str, metavar="LIG",
                        help="H2H için lig filtresi (ör. 'Premier League')")
    parser.add_argument("--rapor",       action="store_true",
                        help="Yüklü veri özeti")
    parser.add_argument("--create-table", action="store_true",
                        help="club_historical_matches tablosunu oluştur")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.create_table:
        create_table(engine)
        return

    if args.rapor:
        rapor(engine)
        return

    if args.h2h:
        result = h2h_kulupler(engine, args.h2h[0], args.h2h[1], lig=args.h2h_lig)
        if result["toplam_mac"] == 0:
            print(f"  {args.h2h[0]} vs {args.h2h[1]}: kayıt yok.")
            return
        print(f"\n  {result['takim1']} vs {result['takim2']} — {result['toplam_mac']} maç")
        print(f"  {result['takim1_galibiyet']}G – {result['beraberlik']}B – {result['takim2_galibiyet']}M")
        print(f"  Gol: {result['takim1_gol']} – {result['takim2_gol']}")
        print("\n  Son maçlar:")
        for m in result["son_5"]:
            print(f"    {m['tarih']}  {m['ev_takim']:20s} {m['gol1']}–{m['gol2']}  {m['dep_takim']:20s}  [{m['lig']}]")
        return

    # Ana: tablo yoksa oluştur, sonra yükle
    create_table(engine)
    run_ingest(engine, ligler_filtre=args.lig, n_sezon=args.sezon)


if __name__ == "__main__":
    main()
