#!/usr/bin/env python3
"""
football-data.co.uk maç sonuçları ve bahis oranları yükleyici.
CSV dosyalarını çekip match_results ve betting_odds tablolarına yazar.

Kullanım:
    python ingest_football_data.py                         # varsayılan ligler/sezonlar
    python ingest_football_data.py --lig SP1 --sezon 2324  # tek lig-sezon
    python ingest_football_data.py --tum                   # tüm tanımlı lig-sezonlar
    python ingest_football_data.py --liste-ligler          # desteklenen ligler

football-data.co.uk CSV formatı:
    Date, HomeTeam, AwayTeam, FTHG, FTAG, FTR (H/D/A)
    B365H, B365D, B365A — Bet365 oranları
    BWH, BWD, BWA       — BetWay oranları
    PSH, PSD, PSA       — Pinnacle oranları
"""

import argparse
import io
import logging
import os
import sys
import time
from datetime import date, datetime
from typing import Optional

import pandas as pd
import requests
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")
RATE_LIMIT = 1.5  # saniye

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; HuCemHatti/1.0)",
}

# football-data.co.uk lig kodları
LEAGUE_CODES = {
    "EPL":        "E0",
    "La_liga":    "SP1",
    "Bundesliga": "D1",
    "Serie_A":    "I1",
    "Ligue_1":    "F1",
    "Championship": "E1",
    "La_liga2":   "SP2",
    "Bundesliga2": "D2",
    "Serie_B":    "I2",
    "Ligue_2":    "F2",
}

# Sezon formatı: 2324 → 2023-24
TARGET_SEASONS = ["2122", "2223", "2324"]
TARGET_LEAGUES_DEFAULT = ["SP1", "D1", "F1", "E0", "I1"]

# CSV'deki bahis sütunları → DB sütun adları
ODDS_COLS = {
    "B365H": "b365_ev",
    "B365D": "b365_beg",
    "B365A": "b365_dep",
    "BWH":   "bw_ev",
    "BWD":   "bw_beg",
    "BWA":   "bw_dep",
    "PSH":   "ps_ev",
    "PSD":   "ps_beg",
    "PSA":   "ps_dep",
}

BASE_URL = "https://www.football-data.co.uk/mmz4281/{season}/{league}.csv"


def _sezon_display(sezon_code: str) -> str:
    """'2324' → '2023-24'"""
    if len(sezon_code) == 4:
        return f"20{sezon_code[:2]}-{sezon_code[2:]}"
    return sezon_code


def _parse_date(val) -> Optional[date]:
    """CSV'deki tarih formatlarını parse eder: DD/MM/YY veya DD/MM/YYYY."""
    if pd.isna(val) or not str(val).strip():
        return None
    s = str(val).strip()
    for fmt in ["%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d"]:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _safe_float(val) -> Optional[float]:
    try:
        f = float(val)
        import math
        return f if not math.isnan(f) else None
    except (TypeError, ValueError):
        return None


def _safe_int(val) -> Optional[int]:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def fetch_csv(league_code: str, sezon_code: str) -> Optional[pd.DataFrame]:
    """football-data.co.uk'tan CSV indirir."""
    url = BASE_URL.format(season=sezon_code, league=league_code)
    try:
        time.sleep(RATE_LIMIT)
        # verify=False: football-data.co.uk self-signed sertifika kullanıyor
        import warnings
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            r = requests.get(url, headers=HEADERS, timeout=20, verify=False)
        if r.status_code == 404:
            log.warning(f"  CSV bulunamadı: {url}")
            return None
        r.raise_for_status()
    except requests.RequestException as e:
        log.error(f"  CSV indirme hatası ({league_code} {sezon_code}): {e}")
        return None

    try:
        df = pd.read_csv(io.StringIO(r.text), encoding="latin-1", on_bad_lines="skip")
        # Boş satırları temizle
        df = df.dropna(how="all")
        log.info(f"  CSV indirildi: {len(df)} satır — {url}")
        return df
    except Exception as e:
        log.error(f"  CSV parse hatası: {e}")
        return None


def upsert_match_result(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO match_results
            (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman,
             ev_gol, dep_gol, sonuc, kaynak)
        VALUES
            (:turnuva, :sezon, :mac_tarihi, :ev_sahibi, :deplasman,
             :ev_gol, :dep_gol, :sonuc, 'football-data')
        ON CONFLICT (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman) DO UPDATE SET
            ev_gol    = EXCLUDED.ev_gol,
            dep_gol   = EXCLUDED.dep_gol,
            sonuc     = EXCLUDED.sonuc,
            guncelleme = NOW()
    """), row)


def upsert_odds(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO betting_odds
            (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman,
             b365_ev, b365_beg, b365_dep,
             bw_ev,   bw_beg,   bw_dep,
             ps_ev,   ps_beg,   ps_dep,
             kaynak)
        VALUES
            (:turnuva, :sezon, :mac_tarihi, :ev_sahibi, :deplasman,
             :b365_ev, :b365_beg, :b365_dep,
             :bw_ev,   :bw_beg,   :bw_dep,
             :ps_ev,   :ps_beg,   :ps_dep,
             'football-data')
        ON CONFLICT (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman) DO UPDATE SET
            b365_ev  = EXCLUDED.b365_ev,
            b365_beg = EXCLUDED.b365_beg,
            b365_dep = EXCLUDED.b365_dep,
            bw_ev    = EXCLUDED.bw_ev,
            bw_beg   = EXCLUDED.bw_beg,
            bw_dep   = EXCLUDED.bw_dep,
            ps_ev    = EXCLUDED.ps_ev,
            ps_beg   = EXCLUDED.ps_beg,
            ps_dep   = EXCLUDED.ps_dep,
            guncelleme = NOW()
    """), row)


def process_dataframe(engine, df: pd.DataFrame, league_code: str, sezon_code: str) -> tuple[int, int]:
    """DataFrame'i işleyip DB'ye yazar. (sonuc_sayisi, odds_sayisi) döner."""
    # Lig adını normalize et
    lig_adi = next((k for k, v in LEAGUE_CODES.items() if v == league_code), league_code)
    sezon = _sezon_display(sezon_code)

    sonuc_ok = odds_ok = 0

    for _, r in df.iterrows():
        mac_tarihi = _parse_date(r.get("Date"))
        ev  = str(r.get("HomeTeam", "") or "").strip()
        dep = str(r.get("AwayTeam", "") or "").strip()
        if not ev or not dep or not mac_tarihi:
            continue

        ev_gol  = _safe_int(r.get("FTHG"))
        dep_gol = _safe_int(r.get("FTAG"))

        # Sonuç: H→E (ev), D→B (beraberlik), A→D (deplasman)
        ftr = str(r.get("FTR", "")).strip().upper()
        sonuc_map = {"H": "E", "D": "B", "A": "D"}
        sonuc = sonuc_map.get(ftr)

        base = {
            "turnuva":   lig_adi,
            "sezon":     sezon,
            "mac_tarihi": mac_tarihi,
            "ev_sahibi":  ev,
            "deplasman":  dep,
        }

        # Maç sonucu
        try:
            with engine.begin() as conn:
                upsert_match_result(conn, {
                    **base,
                    "ev_gol":  ev_gol,
                    "dep_gol": dep_gol,
                    "sonuc":   sonuc,
                })
            sonuc_ok += 1
        except Exception as e:
            log.debug(f"  Sonuç yazma hatası ({ev} vs {dep}): {e}")

        # Bahis oranları — en az bir oran varsa yaz
        odds_row = {col: _safe_float(r.get(src)) for src, col in ODDS_COLS.items()}
        if any(v is not None for v in odds_row.values()):
            try:
                with engine.begin() as conn:
                    upsert_odds(conn, {**base, **odds_row})
                odds_ok += 1
            except Exception as e:
                log.debug(f"  Oran yazma hatası ({ev} vs {dep}): {e}")

    return sonuc_ok, odds_ok


def ingest_league_season(engine, league_code: str, sezon_code: str) -> None:
    label = f"{league_code}/{_sezon_display(sezon_code)}"
    log.info(f"\nfootball-data: {label} işleniyor…")

    df = fetch_csv(league_code, sezon_code)
    if df is None or df.empty:
        log.warning(f"  {label}: veri yok, atlanıyor.")
        return

    sonuc, odds = process_dataframe(engine, df, league_code, sezon_code)
    log.info(f"  ✓ {sonuc} maç sonucu, {odds} bahis oranı kaydedildi.")


def main() -> None:
    parser = argparse.ArgumentParser(description="football-data.co.uk → sonuç & oran DB")
    parser.add_argument("--lig",          type=str, help="Lig kodu (ör. SP1, D1)")
    parser.add_argument("--sezon",        type=str, help="Sezon kodu (ör. 2324)")
    parser.add_argument("--tum",          action="store_true", help="Tüm varsayılan lig-sezonlar")
    parser.add_argument("--liste-ligler", action="store_true", help="Desteklenen ligleri listele")
    args = parser.parse_args()

    if args.liste_ligler:
        print("Desteklenen lig kodları:")
        for name, code in LEAGUE_CODES.items():
            print(f"  {code:6s}  →  {name}")
        return

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.tum:
        for lig in TARGET_LEAGUES_DEFAULT:
            for sezon in TARGET_SEASONS:
                ingest_league_season(engine, lig, sezon)
    elif args.lig and args.sezon:
        ingest_league_season(engine, args.lig, args.sezon)
    else:
        # Varsayılan: son 2 sezon, ana 5 lig
        for lig in TARGET_LEAGUES_DEFAULT:
            for sezon in ["2223", "2324"]:
                ingest_league_season(engine, lig, sezon)

    log.info("\nTamamlandı.")


if __name__ == "__main__":
    main()
