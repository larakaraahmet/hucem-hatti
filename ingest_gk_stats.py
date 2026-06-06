#!/usr/bin/env python3
"""
ingest_gk_stats.py — FBref kaleci istatistikleri yükleyici
===========================================================

FBref'ten Big 5 ligleri için kaleci sezon istatistiklerini çeker:
  - Yenilen gol / GA90
  - Kurtarış sayısı / Save%
  - Gol yememek (clean sheet) sayısı
  - Galibiyet / beraberlik / mağlubiyet
  - Penaltı kurtarışları

Kullanım:
    python ingest_gk_stats.py                       # 2024/25 ve 2025/26 tümü
    python ingest_gk_stats.py --sezon 2024          # 2024/25 sezonu (Big 5)
    python ingest_gk_stats.py --lig "ENG-Premier League"
    python ingest_gk_stats.py --dry-run             # DB'ye yazma
    python ingest_gk_stats.py --rapor               # Mevcut GK veri özeti
"""

import argparse
import logging
import math
import os
import sys
import time
import warnings
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")
logging.getLogger("soccerdata").setLevel(logging.WARNING)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# FBref lig kodu → DB lig adı
LIG_MAP = {
    "ENG-Premier League": "Premier League",
    "ESP-La Liga":        "La Liga",
    "GER-Bundesliga":     "Bundesliga",
    "FRA-Ligue 1":        "Ligue 1",
    "ITA-Serie A":        "Serie A",
}

# Varsayılan hedef sezonlar (FBref format: 2024 = 2024/25)
TARGET_SEASONS = [2025, 2024, 2023]
TARGET_LEAGUES = list(LIG_MAP.keys())

from pathlib import Path
CACHE_DIR = Path(os.path.expanduser("~/soccerdata/data/FBref"))


def _float(v) -> Optional[float]:
    try:
        f = float(v)
        return None if math.isnan(f) else round(f, 3)
    except (TypeError, ValueError):
        return None


def _int(v) -> Optional[int]:
    try:
        f = float(v)
        return None if math.isnan(f) else int(f)
    except (TypeError, ValueError):
        return None


def normalize_name(name: str) -> str:
    import re, unicodedata
    s = unicodedata.normalize("NFKD", str(name or ""))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("-", " ").replace("_", " ")
    return re.sub(r"\s+", " ", s).strip()


def name_score(n1: str, n2: str) -> float:
    a = set(normalize_name(n1).split())
    b = set(normalize_name(n2).split())
    if not a or not b:
        return 0.0
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    if shorter and shorter.issubset(longer):
        return 0.9
    return len(a & b) / len(a | b)


def load_db_gk(engine) -> list[dict]:
    """players tablosundaki kaleceleri yükle."""
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, isim FROM players WHERE mevki ILIKE '%Goalkeeper%' OR mevki ILIKE '%GK%'"
        )).mappings().fetchall()
    return [dict(r) for r in rows]


def best_match(name: str, players: list[dict], threshold: float = 0.45) -> Optional[dict]:
    best_s, best_p = 0.0, None
    for p in players:
        s = name_score(name, p["isim"])
        if s > best_s:
            best_s, best_p = s, p
    return best_p if best_s >= threshold else None


def fetch_keeper_stats(fbref_lig: str, sezon: int, no_cache: bool = False) -> pd.DataFrame:
    """FBref'ten kaleci sezon istatistiklerini çeker."""
    try:
        import soccerdata as sd
        fb = sd.FBref(leagues=fbref_lig, seasons=sezon, data_dir=CACHE_DIR,
                      no_cache=no_cache, no_store=no_cache)
        df = fb.read_player_season_stats(stat_type="keeper")
        return df.reset_index() if not df.empty else pd.DataFrame()
    except Exception as e:
        log.error(f"  FBref keeper stats hatası ({fbref_lig} {sezon}): {e}")
        return pd.DataFrame()


def ingest_gk_stats(
    engine,
    ligler: list[str],
    sezonlar: list[int],
    dry_run: bool = False,
    no_cache: bool = False,
) -> dict:
    """GK istatistiklerini DB'ye yazar."""
    db_gk = load_db_gk(engine)
    log.info(f"DB'de {len(db_gk)} kaleci bulundu.")

    stats = {"islendi": 0, "eslesti": 0, "guncellendi": 0, "eslesmedi": 0}
    unmatched: list[str] = []

    for fbref_lig in ligler:
        lig_db = LIG_MAP.get(fbref_lig, fbref_lig)
        for sezon in sezonlar:
            sezon_str = f"{sezon}/{str(sezon+1)[-2:]}"
            log.info(f"\n── {lig_db} {sezon_str} ──")

            df = fetch_keeper_stats(fbref_lig, sezon, no_cache=no_cache)
            if df.empty:
                log.warning(f"  Veri yok: {fbref_lig} {sezon}")
                continue

            log.info(f"  {len(df)} satır çekildi.")

            for _, row in df.iterrows():
                stats["islendi"] += 1

                player_name = str(row.get(("player",""), row.get("player", "")) or "").strip()
                team_name   = str(row.get(("team",""),   row.get("team", "")) or "").strip()
                pos         = str(row.get(("pos",""),    row.get("pos", "")) or "")

                if not player_name or player_name == "nan":
                    continue
                if pos and "GK" not in pos.upper():
                    continue

                db_p = best_match(player_name, db_gk)
                if not db_p:
                    stats["eslesmedi"] += 1
                    unmatched.append(f"{player_name} ({lig_db})")
                    continue
                stats["eslesti"] += 1

                # İstatistik değerlerini çıkar
                # Tuple MultiIndex kolonlar: ('Playing Time', 'MP') vs ('player', '')
                def g(row, group, key):
                    """DataFrame'den MultiIndex tuple kolonu oku."""
                    return row.get((group, key))

                mac    = _int(g(row, "Playing Time", "MP"))
                dakika = _int(g(row, "Playing Time", "Min"))
                ga     = _int(g(row, "Performance", "GA"))
                ga90   = _float(g(row, "Performance", "GA90"))
                sota   = _int(g(row, "Performance", "SoTA"))
                saves  = _int(g(row, "Performance", "Saves"))
                savepct= _float(g(row, "Performance", "Save%"))
                cs     = _int(g(row, "Performance", "CS"))
                cspct  = _float(g(row, "Performance", "CS%"))
                wins   = _int(g(row, "Performance", "W"))
                draws  = _int(g(row, "Performance", "D"))
                losses = _int(g(row, "Performance", "L"))
                pkatt  = _int(g(row, "Penalty Kicks", "PKatt"))
                pksv   = _int(g(row, "Penalty Kicks", "PKsv"))

                if dry_run:
                    log.info(
                        f"  {player_name:28s} → {db_p['isim']:28s} | "
                        f"mac={mac} GA90={ga90} sv%={savepct} CS={cs}"
                    )
                    continue

                with engine.begin() as conn:
                    conn.execute(text("""
                        INSERT INTO player_gk_stats
                          (oyuncu_id, lig, sezon, takim, mac_sayisi, dakika,
                           yenilen_gol, ga90, isabetli_sut_karsi, kurtaris, kurtaris_pct,
                           gol_yenmeme, gol_yenmeme_pct,
                           galibiyet, beraberlik, maglubiyet,
                           penalti_deneme, penalti_kurtaris,
                           kaynak, guncelleme)
                        VALUES
                          (:pid, :lig, :sezon, :takim, :mac, :dakika,
                           :ga, :ga90, :sota, :saves, :savepct,
                           :cs, :cspct, :wins, :draws, :losses, :pkatt, :pksv,
                           'fbref', NOW())
                        ON CONFLICT (oyuncu_id, sezon, lig) DO UPDATE SET
                          takim              = EXCLUDED.takim,
                          mac_sayisi         = EXCLUDED.mac_sayisi,
                          dakika             = EXCLUDED.dakika,
                          yenilen_gol        = EXCLUDED.yenilen_gol,
                          ga90               = EXCLUDED.ga90,
                          isabetli_sut_karsi = EXCLUDED.isabetli_sut_karsi,
                          kurtaris           = EXCLUDED.kurtaris,
                          kurtaris_pct       = EXCLUDED.kurtaris_pct,
                          gol_yenmeme        = EXCLUDED.gol_yenmeme,
                          gol_yenmeme_pct    = EXCLUDED.gol_yenmeme_pct,
                          galibiyet          = EXCLUDED.galibiyet,
                          beraberlik         = EXCLUDED.beraberlik,
                          maglubiyet         = EXCLUDED.maglubiyet,
                          penalti_deneme     = EXCLUDED.penalti_deneme,
                          penalti_kurtaris   = EXCLUDED.penalti_kurtaris,
                          kaynak             = 'fbref',
                          guncelleme         = NOW()
                    """), {
                        "pid": db_p["id"], "lig": lig_db, "sezon": sezon_str,
                        "takim": team_name,
                        "mac": mac, "dakika": dakika,
                        "ga": ga, "ga90": ga90, "sota": sota,
                        "saves": saves, "savepct": savepct,
                        "cs": cs, "cspct": cspct,
                        "wins": wins, "draws": draws, "losses": losses,
                        "pkatt": pkatt, "pksv": pksv,
                    })
                stats["guncellendi"] += 1

            time.sleep(3.0)

    log.info(f"\n── Özet ──")
    log.info(f"  İşlendi    : {stats['islendi']}")
    log.info(f"  Eşleşti    : {stats['eslesti']}")
    log.info(f"  Güncellendi: {stats['guncellendi']}")
    log.info(f"  Eşleşmedi  : {stats['eslesmedi']}")
    if unmatched:
        log.info(f"  Eşleşmeyen (ilk 10): {unmatched[:10]}")
    return stats


def rapor(engine) -> None:
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                gk.lig, gk.sezon,
                COUNT(DISTINCT gk.oyuncu_id) AS kaleci,
                ROUND(AVG(gk.kurtaris_pct)::numeric, 1) AS ort_sv_pct,
                ROUND(AVG(gk.ga90)::numeric, 2) AS ort_ga90,
                SUM(gk.gol_yenmeme) AS toplam_cs
            FROM player_gk_stats gk
            GROUP BY gk.lig, gk.sezon
            ORDER BY gk.sezon DESC, gk.lig
        """)).fetchall()

    if not rows:
        print("  Henüz GK verisi yok. Çalıştır:")
        print("  python ingest_gk_stats.py")
        return

    print(f"\n{'Lig':<22} {'Sezon':<8} {'Kaleci':>7} {'Sv%':>6} {'GA90':>6} {'CS':>5}")
    print("-" * 58)
    for r in rows:
        print(f"{str(r[0]):<22} {str(r[1]):<8} {r[2]:>7} "
              f"{r[3] or 0:>6} {r[4] or 0:>6} {r[5] or 0:>5}")


def main() -> None:
    parser = argparse.ArgumentParser(description="FBref kaleci istatistikleri yükleyici")
    parser.add_argument("--lig",     type=str, help="FBref lig kodu (ör. 'ENG-Premier League')")
    parser.add_argument("--sezon",   type=int, help="Başlangıç yılı (ör. 2024 = 2024/25)")
    parser.add_argument("--dry-run", action="store_true", help="DB'ye yazma")
    parser.add_argument("--no-cache",action="store_true", help="Cache'i atlat")
    parser.add_argument("--rapor",   action="store_true", help="Mevcut veri özeti")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.rapor:
        rapor(engine)
        return

    ligler  = [args.lig] if args.lig else TARGET_LEAGUES
    sezonlar = [args.sezon] if args.sezon else TARGET_SEASONS

    log.info(f"Ligler  : {ligler}")
    log.info(f"Sezonlar: {sezonlar}")
    log.info(f"Dry-run : {args.dry_run}")

    ingest_gk_stats(engine, ligler, sezonlar,
                    dry_run=args.dry_run, no_cache=args.no_cache)


if __name__ == "__main__":
    main()
