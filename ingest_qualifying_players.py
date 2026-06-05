"""
WC 2026 eleme liglerinden oyuncu istatistiklerini çeker.
api-football.com günlük 100 istek limiti nedeniyle kaldığı yerden devam eder.

Kullanım: python3 ingest_qualifying_players.py
Progress: .qualifying_progress.json dosyasında saklanır.
"""
import json, os, re, urllib.request, time
from sqlalchemy import create_engine, text

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zfbshjkuqjtkjmrfxqez:cemdunyakupasi2026izliyor!@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
)
API_KEY = "71bf39cd056da0837d11f93dfec24ca0"
PROGRESS_FILE = ".qualifying_progress.json"
MAX_REQUESTS = 80  # günlük limitten güvenli pay

LIGLER = [
    (32, 2024, "WC 2026 Qual - Europe",       "2024/25"),
    (29, 2023, "WC 2026 Qual - Africa",        "2023/24"),
    (31, 2022, "WC 2026 Qual - CONCACAF",      "2022/23"),
    (34, 2022, "WC 2026 Qual - South America", "2022/23"),
    (5,  2024, "UEFA Nations League",          "2024/25"),
]

_AKSANLAR = str.maketrans(
    "áàâäéèêëíìîïóòôöúùûüñçğşıćčšžđ",
    "aaaaeeeeiiiioooouuuuncgsiccszd",
)
def _norm(s):
    return re.sub(r"\s+", " ", s.translate(_AKSANLAR).lower().replace("-", " ").strip())

def _jaccard(a, b):
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb: return 0.0
    return len(ta & tb) / len(ta | tb)

def api_get(path):
    req = urllib.request.Request(
        f"https://v3.football.api-sports.io/{path}",
        headers={"x-apisports-key": API_KEY}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {}

def save_progress(p):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(p, f)

def main():
    engine = create_engine(DB_URL)
    progress = load_progress()
    istek_sayisi = 0

    # WC 2026 oyuncu listesini çek
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, isim FROM players WHERE wc_squad_yil=2026")).fetchall()
        db_players = [(r[0], _norm(r[1])) for r in rows]
        all_names = {n: pid for pid, n in db_players}

    def find_player(isim):
        key = _norm(isim)
        if key in all_names:
            return all_names[key]
        best_s, best_id = 0.0, None
        for pid, pname in db_players:
            s = _jaccard(key, pname)
            if s > best_s:
                best_s, best_id = s, pid
        return best_id if best_s >= 0.5 else None

    with engine.begin() as conn:
        for lid, sezon, lig_adi, sezon_db in LIGLER:
            prog_key = f"{lid}_{sezon}"
            current_page = progress.get(prog_key, 1)

            # Toplam sayfa sayısını öğren
            if istek_sayisi >= MAX_REQUESTS:
                break
            d = api_get(f"players?league={lid}&season={sezon}&page=1")
            istek_sayisi += 1
            total_pages = d.get("paging", {}).get("total", 1)

            if current_page > total_pages:
                print(f"{lig_adi}: tamamlandı ✓")
                continue

            print(f"{lig_adi}: sayfa {current_page}/{total_pages} devam ediyor...")

            while current_page <= total_pages and istek_sayisi < MAX_REQUESTS:
                if current_page > 1:
                    d = api_get(f"players?league={lid}&season={sezon}&page={current_page}")
                    istek_sayisi += 1

                yazilan = 0
                for item in d.get("response", []):
                    p = item["player"]
                    stats = item["statistics"]
                    if not stats:
                        continue
                    s = stats[0]

                    pid = find_player(p["name"])
                    if not pid:
                        continue

                    gol    = s["goals"]["total"] or 0
                    asist  = s["goals"]["assists"] or 0
                    mac    = s["games"]["appearences"] or 0
                    dakika = s["games"]["minutes"] or 0
                    sut    = s["shots"]["total"] or 0

                    conn.execute(text("""
                        INSERT INTO player_external_stats
                            (oyuncu_id, lig, sezon, kaynak, mac_sayisi, dakika, gol, asist, sut)
                        VALUES
                            (:pid, :lig, :sezon, 'api-football', :mac, :dak, :gol, :asist, :sut)
                        ON CONFLICT (oyuncu_id, sezon, lig) DO UPDATE SET
                            mac_sayisi = GREATEST(EXCLUDED.mac_sayisi, player_external_stats.mac_sayisi),
                            dakika     = GREATEST(EXCLUDED.dakika,     player_external_stats.dakika),
                            gol        = GREATEST(EXCLUDED.gol,        player_external_stats.gol),
                            asist      = GREATEST(EXCLUDED.asist,      player_external_stats.asist),
                            sut        = GREATEST(EXCLUDED.sut,        player_external_stats.sut)
                    """), {"pid":pid,"lig":lig_adi,"sezon":sezon_db,
                           "mac":mac,"dak":dakika,"gol":gol,"asist":asist,"sut":sut})
                    yazilan += 1

                print(f"  Sayfa {current_page}: {yazilan} WC 2026 oyuncusu eşleşti")
                current_page += 1
                progress[prog_key] = current_page
                save_progress(progress)
                time.sleep(0.3)

    print(f"\nBu çalıştırmada {istek_sayisi} API isteği kullanıldı.")
    print("Yarın tekrar çalıştır: python3 ingest_qualifying_players.py")

if __name__ == "__main__":
    main()
