#!/usr/bin/env python3
"""
2025-26 sezonu maç verisi yükleyici — UCL, Europa, Conference ve tüm ligler.

football-data.org API kullanır — FOOTBALL_DATA_API_KEY gerekli.
Ücretsiz plan: büyük 5 lig + UCL + EL + WC desteklenir; diğerleri 403 dönebilir.

Kullanım:
    python ingest_ucl_europa_2526.py               # tümünü çek
    python ingest_ucl_europa_2526.py --ucl         # sadece UCL 2025-26
    python ingest_ucl_europa_2526.py --europa       # sadece Europa 2025-26
    python ingest_ucl_europa_2526.py --ligler       # sadece kulüp ligleri
    python ingest_ucl_europa_2526.py --dry-run      # DB'ye yazmadan göster
"""

import argparse
import logging
import os
import sys
import time

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")
API_KEY      = os.getenv("FOOTBALL_DATA_API_KEY", "")
BASE_URL     = "https://api.football-data.org/v4"
RATE_DELAY   = 7.0  # ücretsiz plan: 10 istek/dk

HEDEFLER = [
    # (comp_code, sezon, turnuva_ismi, lig_kodu)
    # ── UEFA kulüp turnuvaları ───────────────────────────────────────────────
    ("CL",   "2025", "UEFA Champions League 2025-26",   "UCL"),
    ("EL",   "2025", "UEFA Europa League 2025-26",      "UEL"),
    ("UECL", "2025", "UEFA Conference League 2025-26",  "UECL"),
    # ── Büyük 5 Avrupa ligi 2025-26 ─────────────────────────────────────────
    ("PL",   "2025", "Premier League 2025-26",          "EPL"),
    ("PD",   "2025", "La Liga 2025-26",                 "LaLiga"),
    ("BL1",  "2025", "Bundesliga 2025-26",              "Bundesliga"),
    ("SA",   "2025", "Serie A 2025-26",                 "SerieA"),
    ("FL1",  "2025", "Ligue 1 2025-26",                 "Ligue1"),
    # ── Diğer Avrupa ligleri 2025-26 ────────────────────────────────────────
    ("DED",  "2025", "Eredivisie 2025-26",              "Eredivisie"),
    ("PPL",  "2025", "Primeira Liga 2025-26",           "PrimeiraLiga"),
    ("ELC",  "2025", "Championship 2025-26",            "Championship"),
    ("BL2",  "2025", "2. Bundesliga 2025-26",           "Bundesliga2"),
    ("PD2",  "2025", "Segunda División 2025-26",        "LaLiga2"),
    ("FL2",  "2025", "Ligue 2 2025-26",                 "Ligue2"),
    # ── Amerika / diğer ─────────────────────────────────────────────────────
    ("BSA",  "2025", "Brasileirão 2025",                "Brasileirao"),
    ("CLI",  "2025", "Copa Libertadores 2025",          "Libertadores"),
    ("MLS",  "2025", "MLS 2025",                        "MLS"),
]


def fetch_matches(comp_code: str, sezon: str) -> list[dict]:
    if not API_KEY:
        log.error("FOOTBALL_DATA_API_KEY tanımlı değil. .env dosyasına ekle.")
        return []
    url = f"{BASE_URL}/competitions/{comp_code}/matches"
    headers = {"X-Auth-Token": API_KEY}
    params  = {"season": sezon}
    try:
        r = requests.get(url, headers=headers, params=params, timeout=20)
        if r.status_code == 403:
            log.warning("%s %s — 403 Erişim reddedildi (ücretsiz planda desteklenmeyebilir)", comp_code, sezon)
            return []
        r.raise_for_status()
        return r.json().get("matches", [])
    except Exception as e:
        log.error("%s %s — istek hatası: %s", comp_code, sezon, e)
        return []


def sonuc_kodu(ft: dict) -> str | None:
    ev, dep = ft.get("home"), ft.get("away")
    if ev is None or dep is None:
        return None
    if ev > dep:   return "E"
    if dep > ev:   return "D"
    return "B"


def mac_kaydet(engine, maclar: list[dict], turnuva: str, sezon: str, dry_run: bool) -> int:
    kayit = 0
    with engine.begin() as conn:
        for m in maclar:
            tarih_str = m.get("utcDate", "")
            if not tarih_str:
                continue
            tarih = tarih_str[:10]
            ev  = (m.get("homeTeam") or {}).get("shortName") or (m.get("homeTeam") or {}).get("name")
            dep = (m.get("awayTeam") or {}).get("shortName") or (m.get("awayTeam") or {}).get("name")
            if not ev or not dep:
                continue
            ft = (m.get("score") or {}).get("fullTime") or {}

            if dry_run:
                log.info("[dry-run] %s  %s vs %s  %s-%s", tarih, ev, dep,
                         ft.get("home", "?"), ft.get("away", "?"))
                kayit += 1
                continue

            conn.execute(text("""
                INSERT INTO match_results
                    (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman,
                     ev_gol, dep_gol, sonuc, kaynak)
                VALUES
                    (:turnuva, :sezon, :tarih, :ev, :dep,
                     :ev_gol, :dep_gol, :sonuc, 'football-data.org')
                ON CONFLICT (turnuva, sezon, mac_tarihi, ev_sahibi, deplasman)
                DO UPDATE SET
                    ev_gol = EXCLUDED.ev_gol,
                    dep_gol = EXCLUDED.dep_gol,
                    sonuc   = EXCLUDED.sonuc
            """), dict(
                turnuva=turnuva, sezon=sezon, tarih=tarih,
                ev=ev, dep=dep,
                ev_gol=ft.get("home"), dep_gol=ft.get("away"),
                sonuc=sonuc_kodu(ft),
            ))
            kayit += 1
    return kayit


def main():
    ap = argparse.ArgumentParser(description="UCL/Europa/Lig 2024-25 veri yükleyici")
    ap.add_argument("--ucl",      action="store_true", help="Sadece UCL 2025-26")
    ap.add_argument("--europa",   action="store_true", help="Sadece Europa 2025-26")
    ap.add_argument("--ligler",   action="store_true", help="Sadece kulüp ligleri 2024-25")
    ap.add_argument("--dry-run",  action="store_true", help="DB'ye yazma, sadece göster")
    args = ap.parse_args()

    filtre = set()
    if args.ucl:    filtre.update({"UCL", "UEL", "UECL"})
    if args.europa: filtre.add("UEL")
    if args.ligler: filtre.update({
        "EPL","LaLiga","Bundesliga","SerieA","Ligue1",
        "Eredivisie","PrimeiraLiga","Championship","Bundesliga2","LaLiga2","Ligue2",
        "Brasileirao","Libertadores","MLS",
    })

    hedefler = HEDEFLER if not filtre else [h for h in HEDEFLER if h[3] in filtre]

    engine = create_engine(DATABASE_URL, pool_pre_ping=True) if not args.dry_run else None

    toplam = 0
    for comp_code, sezon, turnuva, lig in hedefler:
        log.info("⏳ %s (%s) çekiliyor…", turnuva, comp_code)
        maclar = fetch_matches(comp_code, sezon)
        log.info("   %d maç bulundu", len(maclar))
        if maclar:
            n = mac_kaydet(engine or create_engine(DATABASE_URL), maclar, turnuva, sezon, args.dry_run)
            log.info("   ✅ %d maç kaydedildi", n)
            toplam += n
        time.sleep(RATE_DELAY)

    log.info("Tamamlandı — toplam %d maç.", toplam)


if __name__ == "__main__":
    main()
