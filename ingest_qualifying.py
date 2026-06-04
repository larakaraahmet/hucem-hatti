"""
api-football.com üzerinden eleme ve Nations League maçlarını çeker,
club_historical_matches tablosuna yazar.
"""
import json, os, urllib.request
from datetime import datetime
from sqlalchemy import create_engine, text

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zfbshjkuqjtkjmrfxqez:cemdunyakupasi2026izliyor!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
)
API_KEY = os.getenv("API_FOOTBALL_KEY", "71bf39cd056da0837d11f93dfec24ca0")

LIGLER = [
    (32, 2024, "WC 2026 Qual - Europe",       "2024/25"),
    (5,  2024, "UEFA Nations League",          "2024/25"),
    (31, 2022, "WC 2026 Qual - CONCACAF",      "2022/23"),
    (29, 2023, "WC 2026 Qual - Africa",        "2023/24"),
    (30, 2026, "WC 2026 Qual - Asia",          "2025/26"),
    (34, 2022, "WC 2026 Qual - South America", "2022/23"),
    (33, 2026, "WC 2026 Qual - Oceania",       "2025/26"),
]

def api_get(path):
    req = urllib.request.Request(
        f"https://v3.football.api-sports.io/{path}",
        headers={"x-apisports-key": API_KEY}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def fetch_fixtures(league_id, season):
    d = api_get(f"fixtures?league={league_id}&season={season}")
    return d.get("response", [])

def main():
    engine = create_engine(DB_URL)

    with engine.begin() as conn:
        toplam = 0
        for league_id, season, lig_adi, sezon_str in LIGLER:
            fixtures = fetch_fixtures(league_id, season)
            if not fixtures:
                print(f"{lig_adi}: veri yok")
                continue

            yazilan = 0
            for f in fixtures:
                tarih = f["fixture"].get("date", "")[:10]
                if not tarih:
                    continue
                ev   = f["teams"]["home"]["name"]
                dep  = f["teams"]["away"]["name"]
                durum = f["fixture"]["status"]["short"]
                ev_gol = f["goals"]["home"] if durum == "FT" else None
                dep_gol = f["goals"]["away"] if durum == "FT" else None

                if ev_gol is not None and dep_gol is not None:
                    if ev_gol > dep_gol:   sonuc = "H"
                    elif ev_gol < dep_gol: sonuc = "A"
                    else:                  sonuc = "D"
                else:
                    sonuc = None

                conn.execute(text("""
                    INSERT INTO club_historical_matches
                        (tarih, lig, sezon, ev_takim, dep_takim,
                         ev_gol, dep_gol, sonuc, kaynak)
                    VALUES
                        (:tarih, :lig, :sezon, :ev, :dep,
                         :eg, :dg, :sonuc, 'api-football')
                    ON CONFLICT (tarih, lig, ev_takim, dep_takim) DO UPDATE SET
                        ev_gol = COALESCE(EXCLUDED.ev_gol, club_historical_matches.ev_gol),
                        dep_gol = COALESCE(EXCLUDED.dep_gol, club_historical_matches.dep_gol),
                        sonuc = COALESCE(EXCLUDED.sonuc, club_historical_matches.sonuc)
                """), {
                    "tarih": tarih, "lig": lig_adi, "sezon": sezon_str,
                    "ev": ev, "dep": dep, "eg": ev_gol, "dg": dep_gol, "sonuc": sonuc
                })
                yazilan += 1

            print(f"{lig_adi}: {yazilan} maç yazıldı")
            toplam += yazilan

    print(f"\nTOPLAM: {toplam} maç")

if __name__ == "__main__":
    main()
