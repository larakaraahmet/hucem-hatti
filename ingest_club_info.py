#!/usr/bin/env python3
"""
ingest_club_info.py — API-Football v3 ile oyuncu kulüp bilgisi yükleyici
========================================================================

Dünya Kupası 2026 kadrosundaki oyuncuların güncel kulüp bilgisini
API-Football'dan çekip players.current_club alanına yazar.

Kaynak: API-Football v3 (api-football.com / RapidAPI)
  GET /players?league=1&season=2026&page=N

Gerekli:
  .env dosyasında API_FOOTBALL_KEY=<anahtarınız>

Kullanım:
  python ingest_club_info.py                  # tümünü yükle
  python ingest_club_info.py --dry-run        # eşleştirmeleri göster, yazmadan
  python ingest_club_info.py --takim Turkey   # tek millî takım
  python ingest_club_info.py --limit 100      # test: ilk 100 oyuncu
  python ingest_club_info.py --rapor          # mevcut doluluk raporu
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from typing import Optional

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

# ── .env yükle ────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL    = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")
API_FOOTBALL_KEY = os.getenv("API_FOOTBALL_KEY", "")

# ── API-Football sabitler ────────────────────────────────────────────────────
API_BASE    = "https://v3.football.api-sports.io"
API_HEADERS = {
    "x-apisports-key": API_FOOTBALL_KEY,
    "Content-Type":    "application/json",
}
LEAGUE_WC2026  = 1      # API-Football WC 2026 lig ID (FIFA World Cup)
SEASON_WC2026  = 2026

# Rate limit: ücretsiz plan = 100 istek/gün, 10/dk
REQUEST_DELAY  = 7.0    # saniye (konservatif, günlük 100 limiti yönetmek için)


# ── İsim normalleştirme ──────────────────────────────────────────────────────

def normalize_name(name: str) -> str:
    """
    İsmi karşılaştırma için normalleştirir:
    - Küçük harf
    - Özel karakterleri ASCII'ye çevir
    - Fazla boşluk temizle
    """
    if not name:
        return ""
    # Basit aksan temizleme
    replacements = {
        "á":"a","à":"a","â":"a","ä":"a","ã":"a","å":"a",
        "é":"e","è":"e","ê":"e","ë":"e",
        "í":"i","ì":"i","î":"i","ï":"i",
        "ó":"o","ò":"o","ô":"o","ö":"o","õ":"o","ø":"o",
        "ú":"u","ù":"u","û":"u","ü":"u",
        "ý":"y","ÿ":"y",
        "ñ":"n","ç":"c","ß":"ss",
        "ğ":"g","ş":"s","ı":"i",
    }
    n = name.lower().strip()
    for k, v in replacements.items():
        n = n.replace(k, v)
    # Birden fazla boşluğu temizle
    return re.sub(r"\s+", " ", n)


def name_match_score(n1: str, n2: str) -> float:
    """
    İki isim arasındaki benzerlik skoru (0-1).
    Token tabanlı, sıra bağımsız.
    """
    a = set(normalize_name(n1).split())
    b = set(normalize_name(n2).split())
    if not a or not b:
        return 0.0
    intersection = len(a & b)
    union        = len(a | b)
    return intersection / union


def find_best_match(
    api_name: str,
    db_players: list[dict],
    threshold: float = 0.5,
) -> Optional[dict]:
    """
    API oyuncu ismine en yakın DB oyuncusunu bulur.
    Eşik altındaki eşleşmeleri reddeder.
    """
    best_score  = 0.0
    best_player = None

    for p in db_players:
        score = name_match_score(api_name, p["isim"])
        if score > best_score:
            best_score  = score
            best_player = p

    if best_score >= threshold:
        return {"player": best_player, "score": best_score}
    return None


# ── API-Football istekleri ───────────────────────────────────────────────────

def api_get(path: str, params: dict = None) -> Optional[dict]:
    """API-Football GET isteği."""
    if not API_FOOTBALL_KEY:
        log.error("API_FOOTBALL_KEY bulunamadı! .env dosyasını kontrol edin.")
        log.info("API anahtarı: https://www.api-football.com veya https://rapidapi.com/api-sports/api/api-football")
        return None
    try:
        r = requests.get(
            f"{API_BASE}{path}",
            headers=API_HEADERS,
            params=params or {},
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        # Kalan istek sayısını logla
        remaining = r.headers.get("x-ratelimit-requests-remaining")
        if remaining:
            log.debug(f"  API kalan istek: {remaining}")
        return data
    except requests.RequestException as e:
        log.error(f"  API isteği başarısız: {e}")
        return None


def fetch_wc_players(
    league: int = LEAGUE_WC2026,
    season: int = SEASON_WC2026,
    max_pages: int = 20,
    team_id: Optional[int] = None,
) -> list[dict]:
    """
    API-Football'dan WC2026 oyuncularını sayfalı olarak çeker.
    Her oyuncu için isim + kulüp bilgisi döndürür.
    """
    all_players = []

    for page in range(1, max_pages + 1):
        params = {"league": league, "season": season, "page": page}
        if team_id:
            params["team"] = team_id

        log.info(f"  Sayfa {page} çekiliyor…")
        data = api_get("/players", params)
        if not data:
            break

        results = data.get("response", [])
        if not results:
            log.info(f"  Sayfa {page}: boş — tamamlandı.")
            break

        for entry in results:
            player = entry.get("player", {})
            stats  = entry.get("statistics", [{}])[0]  # İlk istatistik (genellikle lig)
            team   = stats.get("team", {})
            league_info = stats.get("league", {})

            # Millî takım bilgisi — WC endpoint'inde team ulke bilgisi yok
            # Oyuncunun ulkesi player.nationality'den gelir
            all_players.append({
                "api_id":       player.get("id"),
                "isim":         player.get("name", ""),
                "firstname":    player.get("firstname", ""),
                "lastname":     player.get("lastname", ""),
                "nationality":  player.get("nationality", ""),
                "milliyet":     player.get("nationality", ""),  # alias
                "current_club": team.get("name", ""),
                "club_logo":    team.get("logo", ""),
                "club_id":      team.get("id"),
                "sezon":        league_info.get("season"),
            })

        total_pages = data.get("paging", {}).get("total", 1)
        log.info(f"  Sayfa {page}/{total_pages}: {len(results)} oyuncu")

        if page >= total_pages:
            break

        time.sleep(REQUEST_DELAY)

    log.info(f"  Toplam {len(all_players)} API oyuncusu çekildi.")
    return all_players


def fetch_team_squads(
    team_ids: list[int],
) -> list[dict]:
    """
    /players/squads endpoint'i ile takım kadrosu çeker.
    Her oyuncu için temel bilgi (id, name, position) döndürür.
    NOT: Bu endpoint kulüp bilgisi içermez, /players daha kapsamlıdır.
    """
    all_players = []
    for team_id in team_ids:
        log.info(f"  Takım {team_id} kadrosu çekiliyor…")
        data = api_get("/players/squads", {"team": team_id})
        if not data:
            continue
        for entry in data.get("response", []):
            for p in entry.get("players", []):
                all_players.append({
                    "api_id":   p.get("id"),
                    "isim":     p.get("name", ""),
                    "mevki":    p.get("position", ""),
                })
        time.sleep(REQUEST_DELAY)
    return all_players


# ── DB işlemleri ─────────────────────────────────────────────────────────────

def load_db_players(engine, milliyet_filter: Optional[str] = None) -> list[dict]:
    """DB'deki tüm oyuncuları çeker."""
    q = "SELECT id, isim, mevki, milliyet, current_club FROM players"
    params = {}
    if milliyet_filter:
        q += " WHERE milliyet ILIKE :m"
        params["m"] = f"%{milliyet_filter}%"
    q += " ORDER BY isim"
    with engine.connect() as conn:
        rows = conn.execute(text(q), params).mappings().fetchall()
    return [dict(r) for r in rows]


def update_player_club(
    conn,
    player_id: int,
    club_name: str,
    club_logo: Optional[str] = None,
) -> None:
    conn.execute(text("""
        UPDATE players
        SET current_club      = :club,
            current_club_logo = :logo,
            wc_squad_yil      = 2026
        WHERE id = :id
    """), {"id": player_id, "club": club_name, "logo": club_logo})


# ── Ana eşleştirme ve yükleme ─────────────────────────────────────────────────

def run_ingest(
    engine,
    dry_run: bool = False,
    milliyet_filter: Optional[str] = None,
    limit: Optional[int] = None,
) -> dict:
    """
    API-Football → oyuncu eşleştir → DB güncelle.
    Döndürür: {toplam, eslesti, guncellendi, eslesmedi}
    """
    if not API_FOOTBALL_KEY:
        log.error("API_FOOTBALL_KEY eksik — .env dosyasını kontrol edin.")
        return {}

    # DB oyuncuları
    db_players = load_db_players(engine, milliyet_filter=milliyet_filter)
    log.info(f"  DB'de {len(db_players)} oyuncu" + (f" ({milliyet_filter})" if milliyet_filter else ""))

    # API oyuncuları
    api_players = fetch_wc_players()
    if limit:
        api_players = api_players[:limit]

    stats = {"toplam": len(api_players), "eslesti": 0, "guncellendi": 0, "eslesmedi": 0}

    matched_log = []
    unmatched   = []

    for ap in api_players:
        if not ap["isim"] or not ap["current_club"]:
            continue

        result = find_best_match(ap["isim"], db_players)
        if result:
            stats["eslesti"] += 1
            dp = result["player"]
            matched_log.append({
                "api_isim":    ap["isim"],
                "db_isim":     dp["isim"],
                "kulup":       ap["current_club"],
                "score":       round(result["score"], 2),
                "db_id":       dp["id"],
            })
            if not dry_run:
                with engine.begin() as conn:
                    update_player_club(conn, dp["id"], ap["current_club"], ap.get("club_logo"))
                stats["guncellendi"] += 1
        else:
            stats["eslesmedi"] += 1
            unmatched.append(ap["isim"])

    # Özet
    log.info(f"\n  ─ Eşleştirme Sonuçları ─")
    log.info(f"  API oyuncu    : {stats['toplam']}")
    log.info(f"  Eşleşti       : {stats['eslesti']}")
    log.info(f"  Güncellendi   : {stats['guncellendi']}")
    log.info(f"  Eşleşmedi     : {stats['eslesmedi']}")

    if dry_run:
        log.info("\n  Eşleşenler (ilk 20):")
        for m in matched_log[:20]:
            log.info(f"    [{m['score']:.2f}] {m['api_isim']:30s} → {m['db_isim']:30s} | {m['kulup']}")

        if unmatched:
            log.info(f"\n  Eşleşmeyenler (ilk 10): {unmatched[:10]}")

    return stats


def rapor(engine) -> None:
    """Mevcut kulüp doluluk durumunu göster."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                milliyet,
                COUNT(*) AS toplam,
                COUNT(current_club) AS kulup_dolu,
                ROUND(100.0 * COUNT(current_club) / COUNT(*), 0) AS pct
            FROM players
            GROUP BY milliyet
            HAVING COUNT(*) >= 10
            ORDER BY pct DESC, toplam DESC
            LIMIT 30
        """)).fetchall()

    print(f"\n{'Milliyet':<20} {'Toplam':>7} {'Kulüp Dolu':>10} {'%':>5}")
    print("-" * 48)
    for r in rows:
        bar = "█" * int((r[3] or 0) // 10) + "░" * (10 - int((r[3] or 0) // 10))
        print(f"{str(r[0]):<20} {r[1]:>7} {r[2]:>10} {r[3] or 0:>4.0f}% {bar}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="API-Football'dan WC2026 oyuncu kulüp bilgisi yükleyici"
    )
    parser.add_argument("--dry-run",  action="store_true",
                        help="Sadece eşleştirme yap, DB'ye yazma")
    parser.add_argument("--takim",    type=str, metavar="MİLLİYET",
                        help="Tek millî takım (ör. Turkey, France)")
    parser.add_argument("--limit",    type=int, metavar="N",
                        help="Test için ilk N API kaydını işle")
    parser.add_argument("--rapor",    action="store_true",
                        help="Mevcut doluluk raporu")
    parser.add_argument("--kontrol",  action="store_true",
                        help="API bağlantısını test et")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.rapor:
        rapor(engine)
        return

    if args.kontrol:
        log.info("API bağlantısı test ediliyor…")
        data = api_get("/status")
        if data:
            sub = data.get("response", {}).get("subscription", {})
            log.info(f"  Plan    : {sub.get('plan', '?')}")
            requests_info = data.get("response", {}).get("requests", {})
            log.info(f"  Kullanım: {requests_info.get('current', '?')} / {requests_info.get('limit_day', '?')} istek/gün")
        else:
            log.error("  API bağlantısı başarısız.")
        return

    run_ingest(
        engine,
        dry_run=args.dry_run,
        milliyet_filter=args.takim,
        limit=args.limit,
    )


if __name__ == "__main__":
    main()
