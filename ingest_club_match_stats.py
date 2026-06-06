#!/usr/bin/env python3
"""
Kulüp maçı bazlı oyuncu istatistikleri yükleyici.

İki aşama:
  1. Understat shot verisi → shots tablosu (ingest_understat --shotlar zaten yapıyor)
  2. shots tablosunu aggregate et → player_match_stats (gol, şut, xG per maç)

Kullanım:
    python ingest_club_match_stats.py              # tümünü çalıştır
    python ingest_club_match_stats.py --shotlar    # önce shot ingest et (yavaş)
    python ingest_club_match_stats.py --aggregate  # sadece aggregate
    python ingest_club_match_stats.py --rapor      # mevcut veri özeti
"""

import argparse
import logging
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")


def aggregate_shots_to_match_stats(engine) -> int:
    """
    shots tablosundaki understat verilerini player_match_stats'a yaz.
    Her oyuncu × maç için: gol, şut, isabetli şut, xG aggregate et.
    """
    log.info("Şutlar → player_match_stats aggregate ediliyor…")

    with engine.begin() as conn:
        # Önce kaç shot var kontrol et
        cnt = conn.execute(text(
            "SELECT COUNT(*) FROM shots WHERE source='understat'"
        )).scalar()
        log.info(f"  Understat şut sayısı: {cnt}")

        if cnt == 0:
            log.warning("  Şut verisi yok! Önce 'python ingest_understat.py --sezon 2025 --shotlar' çalıştır.")
            return 0

        # Aggregate ve upsert
        result = conn.execute(text("""
            INSERT INTO player_match_stats
                (oyuncu_id, mac_id, gol, sut, isabetli_sut, xg, asist, xa,
                 progressive_pass, dakika, source)
            SELECT
                s.oyuncu_id,
                s.mac_id,
                SUM(CASE WHEN s.gol_mu THEN 1 ELSE 0 END)::smallint       AS gol,
                COUNT(*)::smallint                                          AS sut,
                SUM(CASE WHEN s.gol_mu THEN 1 ELSE 0 END)::smallint       AS isabetli_sut,
                ROUND(SUM(s.xg)::numeric, 3)                               AS xg,
                0::smallint                                                 AS asist,
                0.0                                                         AS xa,
                0::smallint                                                 AS progressive_pass,
                NULL::smallint                                              AS dakika,
                'understat'                                                 AS source
            FROM shots s
            WHERE s.source = 'understat'
              AND s.oyuncu_id IS NOT NULL
              AND s.mac_id IS NOT NULL
            GROUP BY s.oyuncu_id, s.mac_id
            ON CONFLICT (oyuncu_id, mac_id) DO UPDATE SET
                gol          = GREATEST(player_match_stats.gol,  EXCLUDED.gol),
                sut          = GREATEST(player_match_stats.sut,  EXCLUDED.sut),
                xg           = CASE
                                 WHEN player_match_stats.source = 'understat'
                                 THEN EXCLUDED.xg
                                 ELSE player_match_stats.xg
                               END
        """))

        n = result.rowcount
        log.info(f"  ✅ {n} oyuncu×maç kaydı player_match_stats'a yazıldı.")
        return n


def rapor(engine):
    with engine.connect() as conn:
        shots_cnt = conn.execute(text(
            "SELECT COUNT(*), COUNT(DISTINCT oyuncu_id) FROM shots WHERE source='understat'"
        )).fetchone()
        pms_cnt = conn.execute(text(
            "SELECT COUNT(*), COUNT(DISTINCT oyuncu_id) FROM player_match_stats WHERE source='understat'"
        )).fetchone()
        matches_cnt = conn.execute(text(
            "SELECT COUNT(*) FROM matches WHERE source='understat'"
        )).scalar()

        log.info("── Veri Durumu ──")
        log.info(f"  Understat şutlar : {shots_cnt[0]:,} şut, {shots_cnt[1]} oyuncu")
        log.info(f"  Understat maçlar : {matches_cnt:,} maç (matches tablosunda)")
        log.info(f"  player_match_stats: {pms_cnt[0]:,} kayıt, {pms_cnt[1]} oyuncu (understat)")

        # Top oyuncular
        rows = conn.execute(text("""
            SELECT p.isim, COUNT(*) as mac, SUM(pms.gol) as gol, ROUND(SUM(pms.xg)::numeric,2) as xg
            FROM player_match_stats pms
            JOIN players p ON p.id = pms.oyuncu_id
            WHERE pms.source = 'understat'
            GROUP BY p.isim ORDER BY xg DESC LIMIT 5
        """)).fetchall()
        if rows:
            log.info("  Top xG (understat maç verisi):")
            for r in rows:
                log.info(f"    {r[0]:30s} {r[1]} maç  {r[2]} gol  {r[3]} xG")


def main():
    ap = argparse.ArgumentParser(description="Kulüp maç istatistikleri yükleyici")
    ap.add_argument("--shotlar",   action="store_true", help="Önce understat shot ingest çalıştır")
    ap.add_argument("--aggregate", action="store_true", help="Sadece shots→player_match_stats aggregate")
    ap.add_argument("--rapor",     action="store_true", help="Mevcut veri özeti")
    ap.add_argument("--sezon",     default="2025", help="Understat sezonu (default: 2025)")
    args = ap.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.rapor:
        rapor(engine)
        return

    if args.shotlar:
        log.info("Understat shot ingest başlatılıyor (bu işlem 30-60 dk sürebilir)…")
        import subprocess
        subprocess.run([sys.executable, "ingest_understat.py",
                       "--sezon", args.sezon, "--shotlar"], check=False)

    if args.aggregate or not args.shotlar:
        aggregate_shots_to_match_stats(engine)
        rapor(engine)


if __name__ == "__main__":
    main()
