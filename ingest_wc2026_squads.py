"""
WC 2026 kadrolarını football-data.org'dan çekip players tablosuna işler.

1. Mevcut oyuncularla isim eşleştirmesi yapar (fuzzy)
2. Eşleşenleri wc_squad_yil=2026 ile günceller
3. Yenileri INSERT eder
4. wc_squad_yil=2026 olmayan oyuncuları ve ilgili datayı siler
"""

import os, re, time, json
import urllib.request
from sqlalchemy import create_engine, text

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zfbshjkuqjtkjmrfxqez:cemdunyakupasi2026izliyor!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
)
API_KEY = os.getenv("FOOTBALL_DATA_API_KEY", "acc79dd1ad014beea07a8b048151cfbc")

POSITION_MAP = {
    "Goalkeeper": "Goalkeeper",
    "Defence":    "Defender",
    "Midfield":   "Midfielder",
    "Offence":    "Forward",
}

_AKSANLAR = str.maketrans(
    "áàâäéèêëíìîïóòôöúùûüñçğşıćčšžđ",
    "aaaaeeeeiiiioooouuuuncgsiccszd",
)

def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.translate(_AKSANLAR).lower().strip())

def _jaccard(a: str, b: str) -> float:
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)

def fetch_wc2026_teams():
    url = "https://api.football-data.org/v4/competitions/WC/teams?season=2026"
    req = urllib.request.Request(url, headers={"X-Auth-Token": API_KEY})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)["teams"]

def main():
    engine = create_engine(DB_URL)

    print("WC 2026 kadroları çekiliyor...")
    teams = fetch_wc2026_teams()
    print(f"{len(teams)} takım alındı")

    with engine.begin() as conn:
        # 1. Tüm bağımlı verileri sil
        print("Eski veriler temizleniyor...")
        for tablo in ["shots", "player_match_stats", "player_external_stats",
                      "player_market_values", "player_xg_trends", "player_xt_stats"]:
            r = conn.execute(text(f"DELETE FROM {tablo}"))
            if r.rowcount:
                print(f"  {tablo}: {r.rowcount} kayıt silindi")

        conn.execute(text("DELETE FROM players"))
        print("  players: tümü silindi")

        # 2. Sıfırdan ekle — milliyet = takımın resmi ülke adı
        eklenen = 0
        for team in teams:
            ulke = team["area"]["name"]
            for p in team.get("squad", []):
                conn.execute(text("""
                    INSERT INTO players (isim, mevki, dogum_tarihi, milliyet, wc_squad_yil)
                    VALUES (:isim, :mevki, :dogum, :mil, 2026)
                    ON CONFLICT DO NOTHING
                """), {
                    "isim":  p["name"],
                    "mevki": POSITION_MAP.get(p.get("position", ""), p.get("position", "")),
                    "dogum": p.get("dateOfBirth"),
                    "mil":   ulke,
                })
                eklenen += 1

        toplam = conn.execute(text("SELECT COUNT(*) FROM players")).scalar()
        print(f"\n✅ {eklenen} oyuncu eklendi, DB'de {toplam} oyuncu")
        print("\nÜlke başına oyuncu sayısı:")
        rows = conn.execute(text(
            "SELECT milliyet, COUNT(*) FROM players GROUP BY milliyet ORDER BY milliyet"
        )).fetchall()
        for ulke, sayi in rows:
            print(f"  {ulke}: {sayi}")

if __name__ == "__main__":
    main()
