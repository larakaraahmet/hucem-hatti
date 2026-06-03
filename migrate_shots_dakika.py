#!/usr/bin/env python3
"""
migrate_shots_dakika.py — shots tablosuna dakika + periyot verisi ekler
=======================================================================

StatsBomb open data'dan şutların atıldığı dakikayı (dakika, period) çekip
mevcut shots kayıtlarını günceller.

Çalışma yöntemi:
  1. DB'deki StatsBomb kaynaklı maçlar için SB match_id'yi bul
  2. Mevcut shots kaydını sil
  3. dakika + period içeren yeni kayıtları ekle

Kullanım:
  python migrate_shots_dakika.py              # tüm turnuvalar
  python migrate_shots_dakika.py --turnuva wc2022
  python migrate_shots_dakika.py --kontrol    # kaç şutun dakikası eksik
"""

import argparse
import logging
import os
import sys
import warnings
from typing import Optional

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# ── StatsBomb Turnuva haritası ────────────────────────────────────────────────
# DB turnuva adı → (competition_id, season_id)
TURNUVALAR = {
    "FIFA World Cup 2022":      (43,  106),
    "FIFA World Cup 2018":      (43,  3),
    "UEFA Euro 2024":           (55,  282),
    "UEFA Euro 2020":           (55,  43),
    "Copa América 2024":        (223, 282),
    "La Liga 2020/21":          (11,  90),
    "Ligue 1 2022/23":          (7,   235),
    "Bundesliga 2023/24":       (9,   281),
    "Champions League 2018/19": (16,  4),
}

# Kısa kodlar
KISALTMA = {
    "wc2022":    "FIFA World Cup 2022",
    "wc2018":    "FIFA World Cup 2018",
    "euro2024":  "UEFA Euro 2024",
    "euro2020":  "UEFA Euro 2020",
    "copa2024":  "Copa América 2024",
    "laliga":    "La Liga 2020/21",
    "ligue1":    "Ligue 1 2022/23",
    "bundesliga": "Bundesliga 2023/24",
    "ucl":       "Champions League 2018/19",
}


def normalize_team(name: str) -> str:
    """Takım isimlerini normalize et (StatsBomb ↔ DB eşleştirmesi için)."""
    return (name or "").lower().strip().replace("-", " ").replace(".", "")


def get_sb_matches(competition_id: int, season_id: int) -> pd.DataFrame:
    """StatsBomb'dan maç listesi çeker."""
    from statsbombpy import sb
    matches = sb.matches(competition_id=competition_id, season_id=season_id)
    return matches


def get_db_match_id(conn, turnuva: str, tarih: str, home_team: str, away_team: str) -> Optional[int]:
    """
    DB'de turnuva + tarih + takım ismiyle maç ID'sini bulur.
    teams tablosundaki isim ile StatsBomb takım ismi arasında kısmi eşleştirme yapar.
    """
    row = conn.execute(text("""
        SELECT m.id
        FROM matches m
        JOIN teams ev  ON ev.id  = m.ev_takim_id
        JOIN teams dep ON dep.id = m.deplasman_takim_id
        WHERE m.turnuva = :turnuva
          AND m.tarih   = :tarih
          AND (
            LOWER(ev.isim)  LIKE :h1 OR LOWER(ev.isim)  LIKE :h2
          )
          AND (
            LOWER(dep.isim) LIKE :a1 OR LOWER(dep.isim) LIKE :a2
          )
        LIMIT 1
    """), {
        "turnuva": turnuva,
        "tarih":   tarih,
        "h1": f"%{normalize_team(home_team)[:8]}%",
        "h2": f"%{normalize_team(home_team).split()[-1] if home_team else '?'}%",
        "a1": f"%{normalize_team(away_team)[:8]}%",
        "a2": f"%{normalize_team(away_team).split()[-1] if away_team else '?'}%",
    }).fetchone()
    return row[0] if row else None


def process_match(
    conn,
    sb_match_id: int,
    db_mac_id: int,
    db_players: list[dict],
) -> tuple[int, int]:
    """
    Tek bir maçın shot event'lerini çekip shots tablosuna yazar.
    Önce o maçın mevcut shots'larını siler, sonra dakika bilgisiyle ekler.
    Returns: (silinen, eklenen)
    """
    from statsbombpy import sb
    import re

    # Mevcut shots'ları sil
    deleted = conn.execute(text(
        "DELETE FROM shots WHERE mac_id = :mid RETURNING id"
    ), {"mid": db_mac_id}).rowcount

    # StatsBomb event'lerinden sadece Shot tiplerini al
    try:
        events = sb.events(match_id=sb_match_id)
    except Exception:
        return deleted, 0

    shots = events[events["type"] == "Shot"].copy()
    if shots.empty:
        return deleted, 0

    # Oyuncu ismi → DB id eşleştirme (hızlı lookup dict)
    def norm(n):
        n = (n or "").lower().strip()
        repl = {"á":"a","à":"a","â":"a","ä":"a","é":"e","è":"e","ê":"e","ë":"e",
                "í":"i","ì":"i","î":"i","ï":"i","ó":"o","ò":"o","ô":"o","ö":"o",
                "ú":"u","ù":"u","û":"u","ü":"u","ñ":"n","ç":"c","ğ":"g","ş":"s","ı":"i"}
        for k, v in repl.items():
            n = n.replace(k, v)
        return re.sub(r"\s+", " ", n)

    player_cache: dict[str, Optional[int]] = {}
    db_lookup = {norm(p["isim"]): p["id"] for p in db_players}

    def get_player_id(sb_name: str) -> Optional[int]:
        if sb_name in player_cache:
            return player_cache[sb_name]
        key = norm(sb_name)
        # Tam eşleşme
        if key in db_lookup:
            player_cache[sb_name] = db_lookup[key]
            return db_lookup[key]
        # Token tabanlı en yakın
        tokens = set(key.split())
        best_s, best_id = 0.0, None
        for db_key, db_id in db_lookup.items():
            db_tok = set(db_key.split())
            if not tokens or not db_tok:
                continue
            s = len(tokens & db_tok) / len(tokens | db_tok)
            if s > best_s:
                best_s, best_id = s, db_id
        result = best_id if best_s >= 0.45 else None
        player_cache[sb_name] = result
        return result

    inserted = 0
    for _, shot in shots.iterrows():
        player_id = get_player_id(str(shot.get("player", "")))
        if not player_id:
            continue

        loc = shot.get("location", [None, None])
        x = float(loc[0]) if loc and len(loc) > 0 else None
        y = float(loc[1]) if loc and len(loc) > 1 else None
        if x is None or y is None:
            continue

        xg     = float(shot.get("shot_statsbomb_xg", 0) or 0)
        outcome = str(shot.get("shot_outcome", "")).lower()
        gol_mu = outcome == "goal"
        dakika = int(shot.get("minute", 0) or 0)
        period = int(shot.get("period", 1) or 1)

        conn.execute(text("""
            INSERT INTO shots (oyuncu_id, mac_id, x_konum, y_konum, xg, gol_mu,
                               dakika, period, source)
            VALUES (:pid, :mid, :x, :y, :xg, :gol, :dak, :per, 'statsbomb')
        """), {
            "pid": player_id, "mid": db_mac_id,
            "x": round(x, 2), "y": round(y, 2),
            "xg": round(xg, 4), "gol": gol_mu,
            "dak": dakika, "per": period,
        })
        inserted += 1

    return deleted, inserted


def migrate(
    engine,
    filtre_turnuvalar: Optional[list[str]] = None,
) -> None:
    """Ana migrasyon: seçili turnuvalar için shots'ları dakika bilgisiyle yeniden yükler."""
    from statsbombpy import sb

    hedefler = filtre_turnuvalar or list(TURNUVALAR.keys())

    with engine.connect() as c:
        db_players = [dict(r) for r in c.execute(
            text("SELECT id, isim FROM players")
        ).mappings().fetchall()]

    toplam_silinen = toplam_eklenen = 0

    for turnuva in hedefler:
        if turnuva not in TURNUVALAR:
            log.warning(f"  Bilinmeyen turnuva: {turnuva}")
            continue

        comp_id, season_id = TURNUVALAR[turnuva]
        log.info(f"\n  ── {turnuva} (comp={comp_id}, season={season_id}) ──")

        try:
            sb_matches = get_sb_matches(comp_id, season_id)
        except Exception as e:
            log.error(f"  StatsBomb maç listesi alınamadı: {e}")
            continue

        log.info(f"  {len(sb_matches)} StatsBomb maçı bulundu.")

        with engine.begin() as conn:
            for _, m in sb_matches.iterrows():
                sb_match_id = int(m["match_id"])
                tarih       = str(m.get("match_date", ""))[:10]
                home        = str(m.get("home_team", ""))
                away        = str(m.get("away_team", ""))

                db_mac_id = get_db_match_id(conn, turnuva, tarih, home, away)
                if not db_mac_id:
                    log.debug(f"  DB maç bulunamadı: {tarih} {home} vs {away}")
                    continue

                silinen, eklenen = process_match(conn, sb_match_id, db_mac_id, db_players)
                log.info(f"  {tarih} {home[:12]:12s} vs {away[:12]:12s} "
                         f"→ -{silinen} +{eklenen} şut")
                toplam_silinen += silinen
                toplam_eklenen += eklenen

    log.info(f"\n  ── Migrasyon tamamlandı ──")
    log.info(f"  Silinen : {toplam_silinen}")
    log.info(f"  Eklenen : {toplam_eklenen}")
    log.info(f"  (dakika alanı artık dolu)")


def kontrol(engine) -> None:
    """Kaç şutun dakika bilgisi var / yok."""
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                m.turnuva,
                COUNT(*)                                AS toplam,
                COUNT(s.dakika)                         AS dolu,
                COUNT(*) - COUNT(s.dakika)              AS bos
            FROM shots s
            JOIN matches m ON m.id = s.mac_id
            GROUP BY m.turnuva
            ORDER BY bos DESC
        """)).fetchall()

    print(f"\n{'Turnuva':<30} {'Toplam':>8} {'Dakika Dolu':>12} {'Boş':>6}")
    print("-" * 60)
    for r in rows:
        print(f"{str(r[0]):<30} {r[1]:>8} {r[2]:>12} {r[3]:>6}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="shots tablosuna dakika + period bilgisi ekler"
    )
    parser.add_argument("--turnuva", type=str, nargs="+", metavar="KOD",
                        help=f"Kısaltmalar: {', '.join(KISALTMA)}")
    parser.add_argument("--kontrol", action="store_true",
                        help="Dakika doluluk durumunu göster")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.kontrol:
        kontrol(engine)
        return

    # Kısa kodları uzun isimlere çevir
    filtre = None
    if args.turnuva:
        filtre = [KISALTMA.get(t, t) for t in args.turnuva]

    migrate(engine, filtre)


if __name__ == "__main__":
    main()
