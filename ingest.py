#!/usr/bin/env python3
"""
StatsBomb Open Data → PostgreSQL yükleyici.
Seçilen turnuvanın maç/oyuncu/şut/istatistik verilerini çekip schema.sql
tablolarına yazar.
"""

import logging
import os
import sys
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from statsbombpy import sb
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Loglama
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Sabitler
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# Yüklenecek turnuvalar — (competition_id, season_id, etiket)
COMPETITIONS = [
    (43,  106, "FIFA World Cup 2022"),
    (43,    3, "FIFA World Cup 2018"),
    (55,  282, "UEFA Euro 2024"),
    (55,   43, "UEFA Euro 2020"),
    (223, 282, "Copa América 2024"),
    # Şampiyonlar Ligi finalleri (1 maç her sezon)
    (16,    4, "Champions League 2018/19"),
    (16,    1, "Champions League 2017/18"),
    (16,    2, "Champions League 2016/17"),
    (16,   27, "Champions League 2015/16"),
    (16,   26, "Champions League 2014/15"),
]
TOURNAMENT_NAME = "2022 FIFA Dünya Kupası"

# ---------------------------------------------------------------------------
# Yardımcı dönüşümler
# ---------------------------------------------------------------------------

def to_float(val) -> Optional[float]:
    """NaN veya dönüştürülemeyen değerleri None'a çevirir."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else f
    except (TypeError, ValueError):
        return None


def to_int(val) -> Optional[int]:
    f = to_float(val)
    return None if f is None else int(f)


# ---------------------------------------------------------------------------
# İlerletici pas — StatsBomb tanımı
# ---------------------------------------------------------------------------

def is_progressive(sx: float, sy: float, ex: float, ey: float) -> bool:
    """
    Topun rakip kaleye mesafesi en az 32 yard azalıyorsa ilerletici pas sayılır.
    StatsBomb koordinat sistemi: x=0-120, y=0-80; rakip kale merkezi (120, 40).
    """
    gx, gy = 120.0, 40.0
    d_start = ((gx - sx) ** 2 + (gy - sy) ** 2) ** 0.5
    d_end   = ((gx - ex) ** 2 + (gy - ey) ** 2) ** 0.5
    return (d_start - d_end) >= 32.0


# ---------------------------------------------------------------------------
# Takım ID / isim çıkarımı (statsbombpy sürüm farklılıklarını tolere eder)
# ---------------------------------------------------------------------------

def get_team_id(row: pd.Series, side: str) -> int:
    for col in (f"{side}_team_id", f"{side}_team.{side}_team_id"):
        val = row.get(col)
        if val is not None and pd.notna(val):
            return int(val)
    # Fallback: takım adından deterministik 6 haneli ID
    return abs(hash(str(row.get(f"{side}_team", side)))) % 900_000 + 100_000


def get_team_name(row: pd.Series, side: str) -> str:
    for col in (f"{side}_team", f"{side}_team.{side}_team_name"):
        val = row.get(col)
        if val is not None and pd.notna(val):
            return str(val)
    return side


# ---------------------------------------------------------------------------
# Veritabanı yazıcılar
# ---------------------------------------------------------------------------

def upsert_team(conn, team_id: int, name: str) -> None:
    conn.execute(text("""
        INSERT INTO teams (id, isim, ulke)
        VALUES (:id, :isim, :ulke)
        ON CONFLICT (id) DO NOTHING
    """), {"id": team_id, "isim": name, "ulke": name})


def upsert_player(conn, pid: int, name: str, position: Optional[str], nationality: Optional[str]) -> None:
    conn.execute(text("""
        INSERT INTO players (id, isim, mevki, milliyet)
        VALUES (:id, :isim, :mevki, :milliyet)
        ON CONFLICT (id) DO NOTHING
    """), {"id": pid, "isim": name, "mevki": position, "milliyet": nationality})


def insert_match(conn, match_id: int, date: str, home_id: int, away_id: int, turnuva: str) -> None:
    conn.execute(text("""
        INSERT INTO matches (id, tarih, ev_takim_id, deplasman_takim_id, turnuva)
        VALUES (:id, :tarih, :ev, :dep, :turnuva)
        ON CONFLICT (id) DO UPDATE SET turnuva = EXCLUDED.turnuva
    """), {"id": match_id, "tarih": date, "ev": home_id, "dep": away_id, "turnuva": turnuva})


def upsert_player_stats(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO player_match_stats
            (oyuncu_id, mac_id, dakika, gol, asist, sut,
             isabetli_sut, xg, xa, progressive_pass)
        VALUES
            (:oyuncu_id, :mac_id, :dakika, :gol, :asist, :sut,
             :isabetli_sut, :xg, :xa, :progressive_pass)
        ON CONFLICT (oyuncu_id, mac_id) DO UPDATE SET
            dakika           = EXCLUDED.dakika,
            gol              = EXCLUDED.gol,
            asist            = EXCLUDED.asist,
            sut              = EXCLUDED.sut,
            isabetli_sut     = EXCLUDED.isabetli_sut,
            xg               = EXCLUDED.xg,
            xa               = EXCLUDED.xa,
            progressive_pass = EXCLUDED.progressive_pass
    """), row)


def insert_shot(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO shots (oyuncu_id, mac_id, x_konum, y_konum, xg, gol_mu)
        VALUES (:oyuncu_id, :mac_id, :x_konum, :y_konum, :xg, :gol_mu)
    """), row)


# ---------------------------------------------------------------------------
# xA hesabı: key-pass UUID → şutun xG değeri eşlemesi
# ---------------------------------------------------------------------------

def build_keypass_xg(events: pd.DataFrame) -> dict[str, float]:
    """
    StatsBomb'da xA doğrudan verilmez. Her pas için, o pasa bağlı şutun
    xG'sini bulup eşleriz: pass.id == shot.shot_key_pass_id
    """
    if "shot_key_pass_id" not in events.columns or "shot_statsbomb_xg" not in events.columns:
        return {}

    shots = events[events["type"] == "Shot"] if "type" in events.columns else pd.DataFrame()
    result: dict[str, float] = {}
    for _, s in shots.iterrows():
        kp_id = s.get("shot_key_pass_id")
        xg    = to_float(s.get("shot_statsbomb_xg"))
        if pd.notna(kp_id) and xg is not None:
            result[str(kp_id)] = xg
    return result


# ---------------------------------------------------------------------------
# Dakika hesabı: kadrolar + değişiklik eventlerinden
# ---------------------------------------------------------------------------

def calc_minutes(lineups: dict, events: pd.DataFrame, duration: int) -> dict[int, int]:
    minutes: dict[int, int] = {}

    for df in lineups.values():
        for pid in df["player_id"].dropna().astype(int):
            minutes[pid] = duration  # başlangıç: tam maç oynadı varsay

    if "type" not in events.columns:
        return minutes

    for _, sub in events[events["type"] == "Substitution"].iterrows():
        minute  = to_int(sub.get("minute")) or duration
        pid_out = to_int(sub.get("player_id"))
        pid_in  = to_int(sub.get("substitution_replacement_id"))
        if pid_out:
            minutes[pid_out] = minute
        if pid_in:
            minutes[pid_in] = max(duration - minute, 0)

    return minutes


# ---------------------------------------------------------------------------
# Tek maç işleme (kendi transaction'ı içinde çalışır)
# ---------------------------------------------------------------------------

def process_match(conn, match: pd.Series, turnuva: str = "") -> None:
    match_id  = int(match["match_id"])
    home_id   = get_team_id(match, "home")
    away_id   = get_team_id(match, "away")
    home_name = get_team_name(match, "home")
    away_name = get_team_name(match, "away")
    date      = str(match.get("match_date", ""))

    upsert_team(conn, home_id, home_name)
    upsert_team(conn, away_id, away_name)
    insert_match(conn, match_id, date, home_id, away_id, turnuva)

    # --- Kadrolar ---
    try:
        lineups = sb.lineups(match_id=match_id)  # {takım_adı: DataFrame}
    except Exception as e:
        raise RuntimeError(f"kadro alınamadı: {e}") from e

    for _, lineup_df in lineups.items():
        for _, p in lineup_df.iterrows():
            pid = to_int(p.get("player_id"))
            if not pid:
                continue
            nationality = (
                p["country"]["name"]
                if isinstance(p.get("country"), dict)
                else str(p.get("country", "") or "")
            )
            positions = p.get("positions", [])
            position  = positions[0]["position"] if isinstance(positions, list) and positions else None
            upsert_player(conn, pid, str(p.get("player_name", "")), position, nationality or None)

    # --- Eventler ---
    try:
        events = sb.events(match_id=match_id, flatten_attrs=True)
    except Exception as e:
        raise RuntimeError(f"event verisi alınamadı: {e}") from e

    duration  = to_int(events["minute"].max()) or 90
    minutes   = calc_minutes(lineups, events, duration)
    kp_xg_map = build_keypass_xg(events)

    # --- Şutlar ---
    if "type" in events.columns:
        shot_events = events[events["type"] == "Shot"]
        for _, shot in shot_events.iterrows():
            loc = shot.get("location", [])
            pid = to_int(shot.get("player_id"))
            if not isinstance(loc, list) or len(loc) < 2 or not pid:
                continue
            x, y = to_float(loc[0]), to_float(loc[1])
            if x is None or y is None:
                continue
            try:
                insert_shot(conn, {
                    "oyuncu_id": pid,
                    "mac_id":    match_id,
                    "x_konum":   x,
                    "y_konum":   y,
                    "xg":        to_float(shot.get("shot_statsbomb_xg")),
                    "gol_mu":    shot.get("shot_outcome") == "Goal",
                })
            except Exception as e:
                log.debug(f"Şut satırı atlandı (maç {match_id}): {e}")

    # --- Oyuncu istatistikleri ---
    if "player_id" not in events.columns:
        return

    for pid in [int(p) for p in events["player_id"].dropna().unique()]:
        p_ev = events[events["player_id"] == pid]

        shots_p  = p_ev[p_ev["type"] == "Shot"]  if "type" in p_ev.columns else pd.DataFrame()
        passes_p = p_ev[p_ev["type"] == "Pass"]  if "type" in p_ev.columns else pd.DataFrame()

        # Temel istatistikler
        goals     = int((shots_p.get("shot_outcome", pd.Series()) == "Goal").sum())
        shots_n   = len(shots_p)
        on_target = int(shots_p["shot_outcome"].isin(["Goal", "Saved"]).sum()) if not shots_p.empty else 0
        xg_total  = to_float(shots_p["shot_statsbomb_xg"].sum()) if "shot_statsbomb_xg" in shots_p.columns else 0.0
        assists   = int(passes_p.get("pass_goal_assist", pd.Series(dtype=bool)).fillna(False).sum())

        # xA: key-pass eşlemesinden
        xa_total = 0.0
        if "id" in passes_p.columns:
            xa_total = sum(kp_xg_map.get(str(uid), 0.0) for uid in passes_p["id"] if pd.notna(uid))

        # İlerletici paslar
        prog = 0
        if not passes_p.empty and "pass_end_location" in passes_p.columns:
            for _, pr in passes_p.iterrows():
                try:
                    sl = pr.get("location", [])
                    el = pr.get("pass_end_location", [])
                    if isinstance(sl, list) and isinstance(el, list) and len(sl) >= 2 and len(el) >= 2:
                        if is_progressive(sl[0], sl[1], el[0], el[1]):
                            prog += 1
                except Exception:
                    pass

        upsert_player_stats(conn, {
            "oyuncu_id":        pid,
            "mac_id":           match_id,
            "dakika":           minutes.get(pid),
            "gol":              goals,
            "asist":            assists,
            "sut":              shots_n,
            "isabetli_sut":     on_target,
            "xg":               round(xg_total, 3) if xg_total else None,
            "xa":               round(xa_total, 3) if xa_total else None,
            "progressive_pass": prog,
        })


# ---------------------------------------------------------------------------
# Giriş noktası
# ---------------------------------------------------------------------------

def ingest_competition(engine, competition_id: int, season_id: int, label: str) -> tuple[int, int]:
    """Tek bir turnuvayı yükler. (success, errors) döner."""
    log.info(f"\n{'─'*60}")
    log.info(f"Turnuva: {label} (competition={competition_id}, season={season_id})")
    try:
        matches = sb.matches(competition_id=competition_id, season_id=season_id)
    except Exception as e:
        log.error(f"Maç listesi alınamadı: {e}")
        return 0, 0

    total, success, errors = len(matches), 0, 0
    log.info(f"{total} maç bulundu.")

    for _, match in tqdm(matches.iterrows(), total=total, desc=label[:30]):
        match_id  = int(match["match_id"])
        home_name = get_team_name(match, "home")
        away_name = get_team_name(match, "away")
        try:
            with engine.begin() as conn:
                process_match(conn, match, turnuva=label)
            success += 1
        except Exception as e:
            errors += 1
            log.error(f"  ✗ Maç {match_id} ({home_name} vs {away_name}): {e}")

    log.info(f"{label} tamamlandı — ✓ {success}  ✗ {errors}")
    return success, errors


def main() -> None:
    log.info("Veritabanına bağlanılıyor...")
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    total_ok = total_err = 0
    for comp_id, season_id, label in COMPETITIONS:
        ok, err = ingest_competition(engine, comp_id, season_id, label)
        total_ok  += ok
        total_err += err

    log.info(f"\n{'='*60}")
    log.info(f"GENEL TOPLAM — Başarılı: {total_ok}, Hata: {total_err}")


if __name__ == "__main__":
    main()
