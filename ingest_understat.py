#!/usr/bin/env python3
"""
ingest_understat.py — Understat'tan Big 5 Avrupa ligi xG + şut verisi yükleyici
================================================================================

soccerdata.Understat aracılığıyla oyuncu sezon istatistiklerini ve (opsiyonel)
maç bazlı şut koordinatlarını çeker; player_external_stats + shots tablolarına yazar.

Koordinat dönüşümü:
  Understat (0–1 normalize) → StatsBomb-benzeri koordinatlar
  sb_x = us_x * 120  |  sb_y = us_y * 80

Kullanım:
  python ingest_understat.py                            # tümünü yükle (sezon istatistik)
  python ingest_understat.py --lig EPL                  # tek lig
  python ingest_understat.py --sezon 2024               # tek sezon (2024 = 2024/25)
  python ingest_understat.py --shotlar                  # şut koordinatları da yükle (yavaş)
  python ingest_understat.py --shotlar --limit-mac 5    # sadece son 5 maç şutu
  python ingest_understat.py --rapor                    # doluluk raporu
  python ingest_understat.py --dry-run                  # DB'ye yazmadan göster
"""

import argparse
import logging
import os
import re
import sys
import time
import warnings
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")
logging.getLogger("soccerdata").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# ── Lig haritası ─────────────────────────────────────────────────────────────
LIGLER = {
    "EPL":        "ENG-Premier League",
    "LaLiga":     "ESP-La Liga",
    "Bundesliga": "GER-Bundesliga",
    "Ligue1":     "FRA-Ligue 1",
    "SerieA":     "ITA-Serie A",
}
LIG_TR = {
    "ENG-Premier League": "Premier League",
    "ESP-La Liga":        "La Liga",
    "GER-Bundesliga":     "Bundesliga",
    "FRA-Ligue 1":        "Ligue 1",
    "ITA-Serie A":        "Serie A",
}
# Sezon: 2024 = 2024/25 sezonu, 2023 = 2023/24
SEZONLAR = [2025, 2024, 2023]


# ── Koordinat dönüşümü ───────────────────────────────────────────────────────

def us_to_sb(x: float, y: float) -> tuple[float, float]:
    """
    Understat normalize koordinatları (0–1) → StatsBomb-benzeri (0–120, 0–80).
    Understat: x=1 → kale çizgisi, y=0.5 → merkez
    StatsBomb: x=120 → kale çizgisi, y=40 → merkez
    """
    return round(x * 120, 2), round(y * 80, 2)


# ── İsim normalleştirme ──────────────────────────────────────────────────────

_REPL = {
    "á":"a","à":"a","â":"a","ä":"a","ã":"a","å":"a",
    "é":"e","è":"e","ê":"e","ë":"e",
    "í":"i","ì":"i","î":"i","ï":"i",
    "ó":"o","ò":"o","ô":"o","ö":"o","õ":"o","ø":"o",
    "ú":"u","ù":"u","û":"u","ü":"u",
    "ý":"y","ÿ":"y","ñ":"n","ç":"c","ß":"ss",
    "ğ":"g","ş":"s","ı":"i",
}

def normalize_name(name: str) -> str:
    n = (name or "").lower().strip()
    n = n.replace("-", " ").replace("_", " ")  # Mbappe-Lottin → Mbappe Lottin
    for k, v in _REPL.items():
        n = n.replace(k, v)
    return re.sub(r"\s+", " ", n)

def name_score(n1: str, n2: str) -> float:
    a = set(normalize_name(n1).split())
    b = set(normalize_name(n2).split())
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)

def best_match(api_name: str, db_players: list[dict], threshold: float = 0.5) -> Optional[dict]:
    best_s, best_p = 0.0, None
    for p in db_players:
        s = name_score(api_name, p["isim"])
        if s > best_s:
            best_s, best_p = s, p
    return {"player": best_p, "score": best_s} if best_s >= threshold else None


# ── DB yardımcıları ──────────────────────────────────────────────────────────

def load_db_players(engine) -> list[dict]:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, isim, milliyet FROM players ORDER BY isim")
        ).mappings().fetchall()
    return [dict(r) for r in rows]

def get_or_create_team(conn, team_name: str, ulke: str = "") -> int:
    """Takımı teams tablosunda bulur, yoksa ekler."""
    r = conn.execute(text("SELECT id FROM teams WHERE isim = :n"), {"n": team_name}).fetchone()
    if r:
        return r[0]
    nr = conn.execute(text(
        "INSERT INTO teams (isim, ulke) VALUES (:n, :u) RETURNING id"
    ), {"n": team_name, "u": ulke}).fetchone()
    return nr[0]


# ── Understat: sezon istatistikleri ─────────────────────────────────────────

def fetch_player_season_stats(lig_kod: str, sezon: int, no_store: bool = False) -> pd.DataFrame:
    """soccerdata.Understat ile oyuncu sezon istatistiklerini çeker."""
    try:
        import soccerdata as sd
        ws = sd.Understat(leagues=lig_kod, seasons=sezon, no_store=no_store)
        df = ws.read_player_season_stats()
        return df.reset_index() if not df.empty else df
    except Exception as e:
        log.error(f"  Sezon istatistik hatası ({lig_kod} {sezon}): {e}")
        return pd.DataFrame()


def ingest_season_stats(
    engine,
    ligler: list[str],
    sezonlar: list[int],
    dry_run: bool = False,
    no_store: bool = False,
) -> dict:
    """
    Seçilen ligler ve sezonlar için oyuncu sezon istatistiklerini
    player_external_stats tablosuna yazar (UPSERT).
    """
    db_players = load_db_players(engine)
    log.info(f"  DB'de {len(db_players)} oyuncu yüklendi.")

    stats = {"islendi": 0, "eslesti": 0, "guncellendi": 0, "eslesmedi": 0}
    unmatched: list[str] = []

    for lig_kod in ligler:
        lig_tr = LIG_TR.get(lig_kod, lig_kod)
        for sezon in sezonlar:
            log.info(f"\n  ── {lig_tr} {sezon}/{sezon+1} ──")
            df = fetch_player_season_stats(lig_kod, sezon, no_store=no_store)
            if df.empty:
                log.warning(f"  Veri yok: {lig_kod} {sezon}")
                continue

            log.info(f"  {len(df)} oyuncu çekildi.")

            for _, row in df.iterrows():
                stats["islendi"] += 1
                api_name = str(row.get("player", ""))
                team     = str(row.get("team", ""))

                match = best_match(api_name, db_players)
                if not match:
                    stats["eslesmedi"] += 1
                    unmatched.append(f"{api_name} ({lig_tr})")
                    continue

                stats["eslesti"] += 1
                db_p = match["player"]

                if dry_run:
                    log.info(
                        f"  [{match['score']:.2f}] {api_name:30s} → "
                        f"{db_p['isim']:30s} | {team} | "
                        f"xG={float(row.get('xg',0) or 0):.2f} "
                        f"xa={float(row.get('xa',0) or 0):.2f}"
                    )
                    continue

                sezon_str = f"{sezon}/{str(sezon+1)[-2:]}"
                with engine.begin() as conn:
                    conn.execute(text("""
                        INSERT INTO player_external_stats
                          (oyuncu_id, external_isim, sezon, lig, takim,
                           mac_sayisi, dakika, gol, asist, sut, kilit_pas,
                           xg, xa, npxg, np_gol, kaynak, guncelleme)
                        VALUES
                          (:oyuncu_id, :ext_isim, :sezon, :lig, :takim,
                           :mac, :dakika, :gol, :asist, :sut, :kp,
                           :xg, :xa, :npxg, :npg, 'understat', NOW())
                        ON CONFLICT (oyuncu_id, sezon, lig)
                        DO UPDATE SET
                          takim      = EXCLUDED.takim,
                          mac_sayisi = EXCLUDED.mac_sayisi,
                          dakika     = EXCLUDED.dakika,
                          gol        = EXCLUDED.gol,
                          asist      = EXCLUDED.asist,
                          sut        = EXCLUDED.sut,
                          kilit_pas  = EXCLUDED.kilit_pas,
                          xg         = EXCLUDED.xg,
                          xa         = EXCLUDED.xa,
                          npxg       = EXCLUDED.npxg,
                          np_gol     = EXCLUDED.np_gol,
                          kaynak     = 'understat',
                          guncelleme = NOW()
                    """), {
                        "oyuncu_id": db_p["id"],
                        "ext_isim":  api_name,
                        "sezon":     sezon_str,
                        "lig":       lig_tr,
                        "takim":     team,
                        "mac":       int(row.get("matches",    0) or 0),
                        "dakika":    int(row.get("minutes",    0) or 0),
                        "gol":       int(row.get("goals",      0) or 0),
                        "asist":     int(row.get("assists",    0) or 0),
                        "sut":       int(row.get("shots",      0) or 0),
                        "kp":        int(row.get("key_passes", 0) or 0),
                        "xg":    float(row.get("xg",       0) or 0),
                        "xa":    float(row.get("xa",       0) or 0),
                        "npxg":  float(row.get("np_xg",    0) or 0),
                        "npg":   int(row.get("np_goals",   0) or 0),
                    })
                stats["guncellendi"] += 1

            time.sleep(1.5)  # Understat'ı yormamak için

    log.info(f"\n  ── Sezon İstatistik Özeti ──")
    log.info(f"  İşlendi    : {stats['islendi']}")
    log.info(f"  Eşleşti    : {stats['eslesti']}")
    log.info(f"  Güncellendi: {stats['guncellendi']}")
    log.info(f"  Eşleşmedi  : {stats['eslesmedi']}")
    if unmatched:
        log.info(f"  Eşleşmeyenler (ilk 10): {unmatched[:10]}")
    return stats


# ── Understat: şut koordinatları ────────────────────────────────────────────

def fetch_shots(
    lig_kod: str,
    sezon: int,
    limit_mac: Optional[int] = None,
    no_store: bool = False,
) -> pd.DataFrame:
    """
    Maç bazlı şut koordinatlarını çeker.
    limit_mac: son N maçın şutlarını al (None = tüm sezon — çok yavaş olabilir).
    """
    try:
        import soccerdata as sd
        ws = sd.Understat(leagues=lig_kod, seasons=sezon, no_store=no_store)

        sched = ws.read_schedule().reset_index()
        played = sched[sched.get("is_result", pd.Series(dtype=bool))]
        if played.empty:
            played = sched

        if limit_mac:
            played = played.tail(limit_mac)

        match_ids = played["game_id"].tolist() if "game_id" in played.columns else []
        if not match_ids:
            return pd.DataFrame()

        log.info(f"  {len(match_ids)} maç için şut çekiliyor…")
        shots = ws.read_shot_events(match_id=match_ids)
        return shots.reset_index() if not shots.empty else pd.DataFrame()
    except Exception as e:
        log.error(f"  Şut çekme hatası ({lig_kod} {sezon}): {e}")
        return pd.DataFrame()


def ingest_shots(
    engine,
    ligler: list[str],
    sezonlar: list[int],
    limit_mac: Optional[int] = None,
    dry_run: bool = False,
    no_store: bool = False,
) -> dict:
    """
    Understat şut koordinatlarını shots tablosuna yazar.
    StatsBomb koordinat sistemine dönüştürür: sb_x=X*120, sb_y=Y*80.
    """
    db_players = load_db_players(engine)
    stats = {"islendi": 0, "eklendi": 0, "atildi": 0}

    for lig_kod in ligler:
        lig_tr = LIG_TR.get(lig_kod, lig_kod)
        for sezon in sezonlar:
            log.info(f"\n  ── {lig_tr} {sezon} şutlar ──")
            df = fetch_shots(lig_kod, sezon, limit_mac, no_store)
            if df.empty:
                log.warning("  Şut verisi yok.")
                continue

            log.info(f"  {len(df)} şut çekildi.")

            for _, row in df.iterrows():
                stats["islendi"] += 1
                player_name = str(row.get("player", ""))
                match = best_match(player_name, db_players, threshold=0.45)
                if not match:
                    stats["atildi"] += 1
                    continue

                db_p       = match["player"]
                sb_x, sb_y = us_to_sb(float(row.get("X", 0) or 0), float(row.get("Y", 0) or 0))
                xg         = float(row.get("xG", 0) or 0)
                gol_mu     = str(row.get("result", "")).lower() == "goal"

                if dry_run:
                    log.info(
                        f"  {player_name:25s} → sb({sb_x},{sb_y}) "
                        f"xG={xg:.3f} {'⚽' if gol_mu else ''}"
                    )
                    continue

                # matches tablosunda Understat maç satırı bul/oluştur
                us_match_id  = int(row.get("match_id") or row.get("game_id") or 0)
                home_team    = str(row.get("home_team", ""))
                away_team    = str(row.get("away_team", ""))
                match_date   = str(row.get("date", "2024-01-01"))[:10]

                with engine.begin() as conn:
                    existing = conn.execute(text("""
                        SELECT id FROM matches
                        WHERE turnuva = :tur AND source = 'understat'
                        LIMIT 1
                    """), {"tur": f"us_{us_match_id}"}).fetchone()

                    if not existing:
                        home_id = get_or_create_team(conn, home_team, lig_tr)
                        away_id = get_or_create_team(conn, away_team, lig_tr)
                        if home_id == away_id:
                            stats["atildi"] += 1
                            continue
                        mac_result = conn.execute(text("""
                            INSERT INTO matches (tarih, ev_takim_id, deplasman_takim_id, turnuva, source)
                            VALUES (:t, :ev, :dep, :tur, 'understat')
                            ON CONFLICT DO NOTHING RETURNING id
                        """), {
                            "t": match_date, "ev": home_id, "dep": away_id,
                            "tur": f"us_{us_match_id}",
                        }).fetchone()
                        if not mac_result:
                            stats["atildi"] += 1
                            continue
                        mac_id = mac_result[0]
                    else:
                        mac_id = existing[0]

                    conn.execute(text("""
                        INSERT INTO shots (oyuncu_id, mac_id, x_konum, y_konum, xg, gol_mu, source)
                        VALUES (:pid, :mid, :x, :y, :xg, :gol, 'understat')
                        ON CONFLICT DO NOTHING
                    """), {
                        "pid": db_p["id"], "mid": mac_id,
                        "x": sb_x, "y": sb_y, "xg": xg, "gol": gol_mu,
                    })
                stats["eklendi"] += 1

            time.sleep(2.0)

    log.info(f"\n  ── Şut Özeti ──")
    log.info(f"  İşlendi: {stats['islendi']}, Eklendi: {stats['eklendi']}, Atıldı: {stats['atildi']}")
    return stats


# ── Rapor ────────────────────────────────────────────────────────────────────

def rapor(engine) -> None:
    """Understat verisi doluluk raporu."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT lig, sezon,
                   COUNT(DISTINCT oyuncu_id)   AS oyuncu,
                   ROUND(AVG(xg)::numeric, 2)  AS ort_xg,
                   ROUND(AVG(xa)::numeric, 2)  AS ort_xa,
                   SUM(gol)                    AS toplam_gol
            FROM player_external_stats
            WHERE kaynak = 'understat'
            GROUP BY lig, sezon
            ORDER BY sezon DESC, lig
        """)).fetchall()

    if not rows:
        print("  Henüz Understat verisi yok. Önce çalıştır:")
        print("  python ingest_understat.py")
        return

    print(f"\n{'Lig':<22} {'Sezon':<8} {'Oyuncu':>7} {'Ort.xG':>7} {'Ort.xA':>7} {'Gol':>6}")
    print("-" * 60)
    for r in rows:
        print(f"{str(r[0]):<22} {str(r[1]):<8} {r[2]:>7} "
              f"{r[3] or 0:>7} {r[4] or 0:>7} {r[5]:>6}")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Understat Big 5 ligi xG + şut verisi yükleyici"
    )
    parser.add_argument("--lig",       type=str, metavar="KOD",
                        help=f"Tek lig kodu: {', '.join(LIGLER)}")
    parser.add_argument("--sezon",     type=int, metavar="YIL",
                        help="Sezon başlangıç yılı (2024 → 2024/25 sezonu)")
    parser.add_argument("--shotlar",   action="store_true",
                        help="Şut koordinatlarını da yükle (yavaş, çok istek)")
    parser.add_argument("--limit-mac", type=int, metavar="N",
                        help="Şutlar için son N maçı al (test için küçük tut)")
    parser.add_argument("--rapor",     action="store_true",
                        help="Mevcut Understat verisi doluluk raporu")
    parser.add_argument("--dry-run",   action="store_true",
                        help="DB'ye yazmadan eşleştirmeleri göster")
    parser.add_argument("--no-cache",  action="store_true",
                        help="soccerdata önbelleğini atla (her seferinde çek)")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.rapor:
        rapor(engine)
        return

    # Lig listesi
    if args.lig:
        sd_kod = LIGLER.get(args.lig)
        if not sd_kod:
            log.error(f"Bilinmeyen lig kodu: {args.lig}. Geçerli: {list(LIGLER)}")
            sys.exit(1)
        ligler = [sd_kod]
    else:
        ligler = list(LIGLER.values())

    sezonlar = [args.sezon] if args.sezon else SEZONLAR
    no_store = args.no_cache

    # Her zaman: sezon istatistikleri
    ingest_season_stats(engine, ligler, sezonlar, dry_run=args.dry_run, no_store=no_store)

    # Opsiyonel: şut koordinatları
    if args.shotlar:
        log.info("\n  Şut koordinatları yükleniyor…")
        ingest_shots(engine, ligler, sezonlar,
                     limit_mac=args.limit_mac,
                     dry_run=args.dry_run,
                     no_store=no_store)


if __name__ == "__main__":
    main()
