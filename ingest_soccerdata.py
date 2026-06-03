#!/usr/bin/env python3
"""
FBref / soccerdata oyuncu istatistikleri yükleyici.
Sezonluk aggregate metrikleri (tackle, pressure, carry vb.) çekip
player_external_stats tablosuna yazar.

Kullanım:
    python ingest_soccerdata.py --lig "ESP-La Liga" --sezon "2023-24"
    python ingest_soccerdata.py --tum-ligler
    python ingest_soccerdata.py --liste-ligler

Not: soccerdata FBref'i scrape eder. Rate limit için otomatik bekleme var.
     İlk çalıştırmada SOCCERDATA_DIR dizinine cache kaydeder (~500 MB).
     export SOCCERDATA_DIR=/tmp/soccerdata_cache

Bağımlılıklar: pip install soccerdata fuzzywuzzy python-Levenshtein
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path
from typing import Optional

import pandas as pd
from sqlalchemy import create_engine, text
from tqdm import tqdm

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# Soccerdata cache dizini (disk alanı gerektirir)
CACHE_DIR = Path(os.getenv("SOCCERDATA_DIR", "/tmp/soccerdata_cache"))
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Hedef ligler ve sezonlar
TARGET_LEAGUES = [
    ("ESP-La Liga",   "2022-23"),
    ("ESP-La Liga",   "2023-24"),
    ("FRA-Ligue 1",   "2022-23"),
    ("FRA-Ligue 1",   "2023-24"),
    ("GER-Bundesliga","2022-23"),
    ("GER-Bundesliga","2023-24"),
    ("ENG-Premier League", "2023-24"),
    ("ITA-Serie A",   "2023-24"),
    ("ESP-La Liga",   "2021-22"),
]

# yard → metre çevrim
YARD_TO_M = 0.9144


def normalize_name(name: str) -> str:
    """İsim normalizasyonu: küçük harf, özel karakterler temizle."""
    import unicodedata
    name = str(name).strip().lower()
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    return name


def fuzzy_match_player(fbref_name: str, db_players: pd.DataFrame, threshold: int = 80) -> Optional[int]:
    """
    FBref oyuncu adını DB'deki oyuncularla fuzzy eşleştir.
    Eşleşme yoksa None döner.
    """
    try:
        from fuzzywuzzy import process as fuzz_process
        norm_name = normalize_name(fbref_name)
        choices = {row["oyuncu_id"]: normalize_name(row["isim"]) for _, row in db_players.iterrows()}
        match = fuzz_process.extractOne(norm_name, choices, score_cutoff=threshold)
        if match:
            return match[2]  # oyuncu_id
    except Exception:
        pass
    return None


def load_db_players(engine) -> pd.DataFrame:
    """Veritabanındaki tüm oyuncuları döner."""
    with engine.connect() as conn:
        return pd.DataFrame(conn.execute(text("SELECT id AS oyuncu_id, isim FROM players")).mappings())


def upsert_external_stats(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO player_external_stats (
            oyuncu_id, external_isim, sezon, lig, takim, mac_sayisi, dakika,
            gol, asist, sut, isabetli_sut, xg, xg_katki,
            pas_tamamlanan, pas_denenen, ileri_pas, pas_mesafesi_m,
            surus, surus_mesafesi_m, ileri_surus,
            tackle, tackle_kazanma, araya_girme, blok, baskı, baskı_basarili, top_kazanma,
            driblel_basarili, driblel_denenen, kilit_pas, son_ucte_giris, son_ucte_pas,
            kaynak
        ) VALUES (
            :oyuncu_id, :external_isim, :sezon, :lig, :takim, :mac_sayisi, :dakika,
            :gol, :asist, :sut, :isabetli_sut, :xg, :xg_katki,
            :pas_tamamlanan, :pas_denenen, :ileri_pas, :pas_mesafesi_m,
            :surus, :surus_mesafesi_m, :ileri_surus,
            :tackle, :tackle_kazanma, :araya_girme, :blok, :baskı, :baskı_basarili, :top_kazanma,
            :driblel_basarili, :driblel_denenen, :kilit_pas, :son_ucte_giris, :son_ucte_pas,
            :kaynak
        )
        ON CONFLICT (oyuncu_id, sezon, lig) DO UPDATE SET
            takim           = EXCLUDED.takim,
            mac_sayisi      = EXCLUDED.mac_sayisi,
            dakika          = EXCLUDED.dakika,
            gol             = EXCLUDED.gol,
            asist           = EXCLUDED.asist,
            sut             = EXCLUDED.sut,
            isabetli_sut    = EXCLUDED.isabetli_sut,
            xg              = EXCLUDED.xg,
            tackle          = EXCLUDED.tackle,
            araya_girme     = EXCLUDED.araya_girme,
            baskı           = EXCLUDED.baskı,
            surus           = EXCLUDED.surus,
            kilit_pas       = EXCLUDED.kilit_pas,
            guncelleme      = NOW()
    """), row)


def _safe_int(val, default: int = 0) -> int:
    try:
        v = int(float(val))
        return v if pd.notna(val) else default
    except (TypeError, ValueError):
        return default


def _safe_float(val, default: float = None):
    try:
        f = float(val)
        return f if pd.notna(f) else default
    except (TypeError, ValueError):
        return default


def ingest_league_season(engine, lig: str, sezon: str, db_players: pd.DataFrame) -> tuple[int, int]:
    """Bir lig-sezon kombinasyonunu FBref'ten çeker ve DB'ye yazar."""
    try:
        import soccerdata as sd
    except ImportError:
        log.error("soccerdata paketi bulunamadı: pip install soccerdata")
        return 0, 0

    log.info(f"\n{lig} {sezon} işleniyor…")
    fbref = sd.FBref(leagues=lig, seasons=sezon, data_dir=CACHE_DIR)

    matched = unmatched = 0
    unmatched_names = []

    try:
        # Standart istatistikler
        df_std = fbref.read_player_season_stats("standard")
        time.sleep(2)  # FBref rate limit

        # Savunma istatistikleri
        try:
            df_def = fbref.read_player_season_stats("defense")
            time.sleep(2)
        except Exception:
            df_def = pd.DataFrame()

        # Pres istatistikleri
        try:
            df_prs = fbref.read_player_season_stats("misc")
            time.sleep(2)
        except Exception:
            df_prs = pd.DataFrame()

        # Taşıma istatistikleri
        try:
            df_pss = fbref.read_player_season_stats("passing")
            time.sleep(2)
        except Exception:
            df_pss = pd.DataFrame()

        # Sürüş (possession)
        try:
            df_pos = fbref.read_player_season_stats("possession")
            time.sleep(2)
        except Exception:
            df_pos = pd.DataFrame()

    except Exception as e:
        log.error(f"  FBref veri çekme hatası ({lig} {sezon}): {e}")
        return 0, 0

    if df_std.empty:
        log.warning(f"  Veri boş: {lig} {sezon}")
        return 0, 0

    # Çok-seviyeli sütunları düzleştir
    def flatten_cols(df: pd.DataFrame) -> pd.DataFrame:
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = ["_".join(str(c) for c in col if c).strip("_") for col in df.columns]
        return df

    df_std = flatten_cols(df_std).reset_index() if not isinstance(df_std.index, pd.RangeIndex) else flatten_cols(df_std)
    df_def = flatten_cols(df_def) if not df_def.empty else df_def
    df_pss = flatten_cols(df_pss) if not df_pss.empty else df_pss
    df_pos = flatten_cols(df_pos) if not df_pos.empty else df_pos
    df_prs = flatten_cols(df_prs) if not df_prs.empty else df_prs

    # Oyuncu sütunu bul
    player_col = next((c for c in df_std.columns if "player" in c.lower()), None)
    if not player_col:
        log.warning(f"  Oyuncu sütunu bulunamadı: {df_std.columns.tolist()[:10]}")
        return 0, 0

    for _, row in tqdm(df_std.iterrows(), total=len(df_std), desc=f"{lig} {sezon}"):
        fbref_name = str(row.get(player_col, ""))
        if not fbref_name or fbref_name == "nan":
            continue

        # Oyuncu eşleştirme
        pid = fuzzy_match_player(fbref_name, db_players)
        if pid is None:
            unmatched_names.append(fbref_name)
            unmatched += 1
            continue

        matched += 1
        team_col = next((c for c in df_std.columns if "squad" in c.lower() or "team" in c.lower()), None)
        takim = str(row.get(team_col, "")) if team_col else ""

        # Dakika — farklı sütun adlarını dene
        dk = _safe_int(
            row.get("Playing_Time_Min") or row.get("Min") or row.get("playing_time_min") or 0
        )

        # Mesafe (yard → metre)
        pas_mesafesi_yrd = _safe_int(row.get("Passing_TotDist") or row.get("TotDist") or 0)
        surus_mesafesi_yrd = _safe_int(row.get("Carries_TotDist") or row.get("carries_TotDist") or 0)

        stat_row = {
            "oyuncu_id":       pid,
            "external_isim":   fbref_name,
            "sezon":           sezon,
            "lig":             lig,
            "takim":           takim,
            "mac_sayisi":      _safe_int(row.get("MP") or row.get("Matches_played") or 0),
            "dakika":          dk,
            "gol":             _safe_int(row.get("Gls") or row.get("Goals") or 0),
            "asist":           _safe_int(row.get("Ast") or row.get("Assists") or 0),
            "sut":             _safe_int(row.get("Sh") or row.get("Shots") or 0),
            "isabetli_sut":    _safe_int(row.get("SoT") or 0),
            "xg":              _safe_float(row.get("xG") or row.get("expected_xg")),
            "xg_katki":        _safe_float(row.get("xAG") or row.get("npxG+xAG")),
            "pas_tamamlanan":  _safe_int(row.get("Cmp") or 0),
            "pas_denenen":     _safe_int(row.get("Att") or 0),
            "ileri_pas":       _safe_int(row.get("PrgP") or row.get("Prog") or 0),
            "pas_mesafesi_m":  round(pas_mesafesi_yrd * YARD_TO_M),
            "surus":           _safe_int(row.get("Carries") or 0),
            "surus_mesafesi_m": round(surus_mesafesi_yrd * YARD_TO_M),
            "ileri_surus":     _safe_int(row.get("PrgC") or row.get("PrgDist") or 0),
            "tackle":          0, "tackle_kazanma": 0, "araya_girme": 0,
            "blok": 0, "baskı": 0, "baskı_basarili": 0, "top_kazanma": 0,
            "driblel_basarili": 0, "driblel_denenen": 0,
            "kilit_pas": 0, "son_ucte_giris": 0, "son_ucte_pas": 0,
            "kaynak": "fbref",
        }

        # Savunma istatistikleri
        if not df_def.empty:
            def_row = _find_player_row(df_def, fbref_name, player_col)
            if def_row is not None:
                stat_row["tackle"]          = _safe_int(def_row.get("Tkl") or def_row.get("TklW") or 0)
                stat_row["tackle_kazanma"]  = _safe_int(def_row.get("TklW") or 0)
                stat_row["araya_girme"]     = _safe_int(def_row.get("Int") or 0)
                stat_row["blok"]            = _safe_int(def_row.get("Blocks_Blocks") or def_row.get("Blocks") or 0)

        # Baskı istatistikleri
        if not df_prs.empty:
            prs_row = _find_player_row(df_prs, fbref_name, player_col)
            if prs_row is not None:
                stat_row["baskı"]          = _safe_int(prs_row.get("Press") or prs_row.get("Pressures_Press") or 0)
                stat_row["baskı_basarili"] = _safe_int(prs_row.get("Succ") or prs_row.get("Pressures_Succ") or 0)
                stat_row["top_kazanma"]    = _safe_int(prs_row.get("Recov") or 0)

        # Taşıma / dripleme
        if not df_pos.empty:
            pos_row = _find_player_row(df_pos, fbref_name, player_col)
            if pos_row is not None:
                stat_row["driblel_basarili"] = _safe_int(pos_row.get("Succ.1") or pos_row.get("Dribbles_Succ") or 0)
                stat_row["driblel_denenen"]  = _safe_int(pos_row.get("Att.1") or pos_row.get("Dribbles_Att") or 0)

        # Pas son üçte / kilit pas
        if not df_pss.empty:
            pss_row = _find_player_row(df_pss, fbref_name, player_col)
            if pss_row is not None:
                stat_row["kilit_pas"]      = _safe_int(pss_row.get("KP") or 0)
                stat_row["son_ucte_giris"] = _safe_int(pss_row.get("1/3") or 0)
                stat_row["son_ucte_pas"]   = _safe_int(pss_row.get("Att 1/3") or 0)

        try:
            with engine.begin() as conn:
                upsert_external_stats(conn, stat_row)
        except Exception as e:
            log.debug(f"  DB yazma hatası ({fbref_name}): {e}")

    if unmatched_names:
        log.warning(f"  {unmatched} eşleşmeyen oyuncu: {unmatched_names[:5]}{'…' if len(unmatched_names)>5 else ''}")

    log.info(f"  ✓ {matched} eşleşti, ✗ {unmatched} eşleşmedi")
    return matched, unmatched


def _find_player_row(df: pd.DataFrame, name: str, player_col: str) -> Optional[dict]:
    """DataFrame'den oyuncu satırını fuzzy bul."""
    if df.empty:
        return None
    norm = normalize_name(name)
    for _, row in df.iterrows():
        if normalize_name(str(row.get(player_col, ""))) == norm:
            return row.to_dict()
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="FBref → player_external_stats")
    parser.add_argument("--lig",        type=str, help="Lig kodu (ör. 'ESP-La Liga')")
    parser.add_argument("--sezon",      type=str, help="Sezon (ör. '2023-24')")
    parser.add_argument("--tum-ligler", action="store_true", help="Tüm hedef ligleri çek")
    parser.add_argument("--liste-ligler",action="store_true", help="Hedef ligleri listele")
    args = parser.parse_args()

    if args.liste_ligler:
        for l, s in TARGET_LEAGUES:
            print(f"  {l}  ({s})")
        return

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    db_players = load_db_players(engine)
    log.info(f"DB'de {len(db_players)} oyuncu bulundu.")

    targets = TARGET_LEAGUES if args.tum_ligler else [(args.lig, args.sezon)] if args.lig else TARGET_LEAGUES[:2]
    for lig, sezon in targets:
        ingest_league_season(engine, lig, sezon, db_players)


if __name__ == "__main__":
    main()
