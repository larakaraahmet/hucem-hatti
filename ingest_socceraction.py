#!/usr/bin/env python3
"""
socceraction xT pipeline.
Mevcut StatsBomb event verisini SPADL formatına çevirip xT / action value
hesaplar, player_xt_stats tablosuna yazar.

Kullanım:
    python ingest_socceraction.py                  # tüm maçlar
    python ingest_socceraction.py --mac-id 3788741 # tek maç
    python ingest_socceraction.py --turnuva "FIFA World Cup 2022"
"""

import argparse
import logging
import os
import sys
import warnings
from typing import Optional

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text
from tqdm import tqdm

warnings.filterwarnings("ignore", category=FutureWarning)

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# StatsBomb koordinat sistemi:
# Saha uzunluğu: 120 birim ≈ 105 metre
# Saha genişliği: 80 birim  ≈ 68 metre
# 1 birim ≈ 0.875 metre (uzunluk), ≈ 0.85 metre (genişlik)
BIRIM_TO_METRE_X = 105.0 / 120.0   # ≈ 0.875
BIRIM_TO_METRE_Y = 68.0  / 80.0    # ≈ 0.850


# ---------------------------------------------------------------------------
# xT ızgara modeli (statik — veri gerektirmez)
# ---------------------------------------------------------------------------

def _load_xt_model() -> np.ndarray:
    """
    16×12 xT ızgara modeli.
    Kaynağı: Karun Singh'in orijinal modeli (https://karun.in/blog/expected-threat.html)
    Satır = saha genişliği (kapıdan kapıya 12 dilim),
    Sütun = saha uzunluğu (0'dan 16 dilime)
    Sağ taraftaki (düşman kalesine yakın) değerler daha yüksek.
    """
    xt = np.array([
        [0.00638, 0.00949, 0.01200, 0.01462, 0.02011, 0.02961,
         0.03935, 0.04923, 0.06165, 0.09172, 0.13778, 0.19741,
         0.25067, 0.25529, 0.27756, 0.31124],
        [0.00779, 0.01004, 0.01212, 0.01611, 0.02145, 0.03191,
         0.04225, 0.05276, 0.06701, 0.09876, 0.14695, 0.21186,
         0.27022, 0.27862, 0.30282, 0.34400],
        [0.00851, 0.01079, 0.01311, 0.01726, 0.02342, 0.03538,
         0.04771, 0.05985, 0.07591, 0.11180, 0.16470, 0.23668,
         0.30308, 0.31530, 0.34234, 0.38995],
        [0.00896, 0.01136, 0.01393, 0.01843, 0.02530, 0.03868,
         0.05239, 0.06556, 0.08327, 0.12182, 0.17872, 0.25554,
         0.32708, 0.34149, 0.37108, 0.42402],
        [0.00922, 0.01174, 0.01447, 0.01924, 0.02647, 0.04069,
         0.05507, 0.06876, 0.08750, 0.12742, 0.18607, 0.26539,
         0.33896, 0.35552, 0.38576, 0.44100],
        [0.00937, 0.01197, 0.01479, 0.01974, 0.02719, 0.04196,
         0.05678, 0.07083, 0.09015, 0.13112, 0.19094, 0.27172,
         0.34693, 0.36487, 0.39492, 0.45148],
        [0.00937, 0.01197, 0.01479, 0.01974, 0.02719, 0.04196,
         0.05678, 0.07083, 0.09015, 0.13112, 0.19094, 0.27172,
         0.34693, 0.36487, 0.39492, 0.45148],
        [0.00922, 0.01174, 0.01447, 0.01924, 0.02647, 0.04069,
         0.05507, 0.06876, 0.08750, 0.12742, 0.18607, 0.26539,
         0.33896, 0.35552, 0.38576, 0.44100],
        [0.00896, 0.01136, 0.01393, 0.01843, 0.02530, 0.03868,
         0.05239, 0.06556, 0.08327, 0.12182, 0.17872, 0.25554,
         0.32708, 0.34149, 0.37108, 0.42402],
        [0.00851, 0.01079, 0.01311, 0.01726, 0.02342, 0.03538,
         0.04771, 0.05985, 0.07591, 0.11180, 0.16470, 0.23668,
         0.30308, 0.31530, 0.34234, 0.38995],
        [0.00779, 0.01004, 0.01212, 0.01611, 0.02145, 0.03191,
         0.04225, 0.05276, 0.06701, 0.09876, 0.14695, 0.21186,
         0.27022, 0.27862, 0.30282, 0.34400],
        [0.00638, 0.00949, 0.01200, 0.01462, 0.02011, 0.02961,
         0.03935, 0.04923, 0.06165, 0.09172, 0.13778, 0.19741,
         0.25067, 0.25529, 0.27756, 0.31124],
    ])
    return xt


XT_MODEL = _load_xt_model()   # 12×16 ızgara


def _xt_at(x: float, y: float) -> float:
    """
    StatsBomb koordinatındaki (x, y) noktasının xT değerini döner.
    x: 0–120 (saha uzunluğu), y: 0–80 (saha genişliği)
    """
    col = min(int(x / 120.0 * 16), 15)
    row = min(int(y / 80.0  * 12), 11)
    return float(XT_MODEL[row, col])


def _xt_delta(x0: float, y0: float, x1: float, y1: float) -> float:
    """İki nokta arasındaki xT farkı (Δ xT)."""
    return _xt_at(x1, y1) - _xt_at(x0, y0)


# ---------------------------------------------------------------------------
# Maç event verisini DB'den çek
# ---------------------------------------------------------------------------

def load_match_events(mac_id: int, engine) -> pd.DataFrame:
    """
    Mevcut StatsBomb event verilerini DB'deki tablolardan yeniden yapılandırır.
    Shot + Pass + birleşik maç bazlı per-player toplamları döner.
    (Eventler doğrudan DB'de değil; oyuncu_match_stats + shots tablosundan çıkarılır.)
    """
    sql_stats = """
    SELECT pms.oyuncu_id, p.isim, pms.dakika,
           pms.gol, pms.asist, pms.sut, pms.isabetli_sut,
           pms.xg, pms.xa, pms.progressive_pass
    FROM player_match_stats pms
    JOIN players p ON p.id = pms.oyuncu_id
    WHERE pms.mac_id = :mac_id
    """
    sql_shots = """
    SELECT oyuncu_id, x_konum, y_konum, xg, gol_mu
    FROM shots
    WHERE mac_id = :mac_id
    """
    with engine.connect() as conn:
        df_stats = pd.DataFrame(conn.execute(text(sql_stats), {"mac_id": mac_id}).mappings())
        df_shots = pd.DataFrame(conn.execute(text(sql_shots), {"mac_id": mac_id}).mappings())
    return df_stats, df_shots


# ---------------------------------------------------------------------------
# xT hesaplama
# ---------------------------------------------------------------------------

def compute_xt_for_match(mac_id: int, engine) -> list[dict]:
    """
    Tek bir maçtaki tüm oyuncular için xT metriklerini hesaplar.
    Mevcut DB verisinden türetir (event-level veri yoksa approximate).

    Returns: [{ oyuncu_id, mac_id, xt_toplam, xt_ofansif, ... }]
    """
    df_stats, df_shots = load_match_events(mac_id, engine)
    if df_stats.empty:
        return []

    results = []
    for _, row in df_stats.iterrows():
        pid = int(row["oyuncu_id"])
        dakika = int(row["dakika"]) if row["dakika"] else 0
        if dakika < 1:
            continue

        # Şut xT: şutun konumundan gol alanına xT farkı
        player_shots = df_shots[df_shots["oyuncu_id"] == pid]
        sut_xt = 0.0
        for _, s in player_shots.iterrows():
            x, y = float(s["x_konum"] or 0), float(s["y_konum"] or 0)
            # Şut: konumdan gol çizgisi ortasına (120, 40)
            delta = _xt_delta(x, y, 120.0, 40.0)
            sut_xt += max(delta, 0.0)

        # Pas xT approximation:
        # Progressive pass × ortalama katkı tahmini (event veri yokken)
        prog_pas = int(row["progressive_pass"] or 0)
        # Orta saha ilerletici pas ortalama ≈ 0.03 xT katkısı
        pas_xt = prog_pas * 0.028

        # xA-based pas değeri (key pass contribution)
        xa = float(row["xa"] or 0)
        pas_xt += xa * 0.6   # xA kısmen xT ile örtüşür

        # Toplam ofansif xT
        xt_ofansif = sut_xt + pas_xt

        # Action value (basit: xG + xA contribution)
        xg = float(row["xg"] or 0)
        action_value = xg * 0.9 + xa * 0.7 + pas_xt * 0.3

        results.append({
            "oyuncu_id":    pid,
            "mac_id":       mac_id,
            "xt_toplam":    round(xt_ofansif, 5),
            "xt_ofansif":   round(xt_ofansif, 5),
            "xt_defansif":  0.0,   # event-level olmadan hesaplanamaz
            "action_value": round(action_value, 5),
            "taşıma_xt":    0.0,
            "pas_xt":       round(pas_xt, 5),
            "sut_xt":       round(sut_xt, 5),
            "dakika":       dakika,
        })
    return results


# ---------------------------------------------------------------------------
# DB yazma
# ---------------------------------------------------------------------------

def upsert_xt_stats(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO player_xt_stats
            (oyuncu_id, mac_id, xt_toplam, xt_ofansif, xt_defansif,
             action_value, taşıma_xt, pas_xt, sut_xt, dakika)
        VALUES
            (:oyuncu_id, :mac_id, :xt_toplam, :xt_ofansif, :xt_defansif,
             :action_value, :taşıma_xt, :pas_xt, :sut_xt, :dakika)
        ON CONFLICT (oyuncu_id, mac_id) DO UPDATE SET
            xt_toplam    = EXCLUDED.xt_toplam,
            xt_ofansif   = EXCLUDED.xt_ofansif,
            action_value = EXCLUDED.action_value,
            pas_xt       = EXCLUDED.pas_xt,
            sut_xt       = EXCLUDED.sut_xt,
            guncelleme   = NOW()
    """), row)


# ---------------------------------------------------------------------------
# İleri seviye: socceraction SPADL entegrasyonu (paket kuruluysa)
# ---------------------------------------------------------------------------

def _try_socceraction_xt(mac_id: int, engine) -> Optional[list[dict]]:
    """
    socceraction paketi varsa StatsBomb API'den event çekip gerçek xT hesaplar.
    Paket yoksa None döner, fallback kullanılır.
    """
    try:
        import socceraction.spadl.statsbomb as spadl_sb
        import socceraction.xthreat as xthreat
        from statsbombpy import sb

        log.info(f"  socceraction ile gerçek SPADL xT hesaplanıyor (maç {mac_id})…")

        # StatsBomb event verisi
        events = sb.events(match_id=mac_id, flatten_attrs=True)
        lineups = sb.lineups(match_id=mac_id)

        # SPADL dönüşümü
        home_team, away_team = list(lineups.keys())[:2]
        home_id = int(lineups[home_team]["player_id"].iloc[0]) // 1000 * 1000  # kaba takim id
        away_id = home_id + 1

        try:
            actions = spadl_sb.convert_to_actions(events, home_team_id=home_id)
        except Exception as e:
            log.debug(f"  SPADL dönüşüm hatası: {e}")
            return None

        # xT model (socceraction built-in)
        xT = xthreat.ExpectedThreat(l=16, w=12)
        # Not: socceraction xT modeli için ayrı fit gerekebilir
        # Basit fallback: grid-based model kullan
        xT._xT = XT_MODEL

        try:
            xt_values = xT.rate(actions)
            actions["xt"] = xt_values
        except Exception as e:
            log.debug(f"  xT rating hatası: {e}")
            return None

        # Oyuncu bazında topla
        player_xt = (
            actions.groupby("player_id")["xt"]
            .agg(["sum", "count"])
            .reset_index()
        )
        player_xt.columns = ["player_id", "xt_toplam", "aksiyon_sayisi"]

        # DB'deki oyuncu ID'leriyle eşleştir
        with engine.connect() as conn:
            player_rows = conn.execute(text(
                "SELECT pms.oyuncu_id, pms.dakika FROM player_match_stats pms WHERE pms.mac_id = :mid"
            ), {"mid": mac_id}).mappings().fetchall()
        dk_map = {r["oyuncu_id"]: r["dakika"] or 0 for r in player_rows}

        results = []
        for _, r in player_xt.iterrows():
            pid = int(r["player_id"])
            if pid not in dk_map:
                continue
            xt_val = float(r["xt_toplam"])
            results.append({
                "oyuncu_id":    pid,
                "mac_id":       mac_id,
                "xt_toplam":    round(max(xt_val, 0), 5),
                "xt_ofansif":   round(max(xt_val, 0), 5),
                "xt_defansif":  round(max(-xt_val, 0), 5),
                "action_value": round(abs(xt_val) * 1.2, 5),
                "taşıma_xt":    0.0,
                "pas_xt":       0.0,
                "sut_xt":       0.0,
                "dakika":       dk_map[pid],
            })
        return results

    except ImportError:
        return None
    except Exception as e:
        log.debug(f"  socceraction xT hatası: {e}")
        return None


# ---------------------------------------------------------------------------
# Ana işleme
# ---------------------------------------------------------------------------

def process_match_xt(mac_id: int, engine) -> int:
    """Bir maç için xT hesaplar ve DB'ye yazar. Kaydedilen satır sayısını döner."""
    # Önce socceraction ile dene, olmadıysa fallback
    rows = _try_socceraction_xt(mac_id, engine)
    if rows is None:
        rows = compute_xt_for_match(mac_id, engine)

    if not rows:
        return 0

    with engine.begin() as conn:
        for row in rows:
            upsert_xt_stats(conn, row)

    return len(rows)


def run_all(engine, turnuva: Optional[str] = None, mac_ids: Optional[list] = None) -> None:
    """Tüm maçları veya seçili maçları işler."""
    if mac_ids:
        match_list = [(mid,) for mid in mac_ids]
    else:
        sql = "SELECT id FROM matches"
        params = {}
        if turnuva:
            sql += " WHERE turnuva ILIKE :t"
            params["t"] = f"%{turnuva}%"
        sql += " ORDER BY tarih"
        with engine.connect() as conn:
            match_list = [(r[0],) for r in conn.execute(text(sql), params).fetchall()]

    log.info(f"İşlenecek maç: {len(match_list)}")
    toplam = 0
    for (mid,) in tqdm(match_list, desc="xT hesaplama"):
        try:
            n = process_match_xt(mid, engine)
            toplam += n
        except Exception as e:
            log.warning(f"  Maç {mid} xT hatası: {e}")

    log.info(f"Tamamlandı — {toplam} oyuncu-maç kaydı eklendi.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="StatsBomb → xT pipeline")
    parser.add_argument("--mac-id", type=int, nargs="+", help="Belirli maç ID'leri")
    parser.add_argument("--turnuva", type=str, help="Turnuva adı filtresi")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    run_all(engine, turnuva=args.turnuva, mac_ids=args.mac_id)


if __name__ == "__main__":
    main()
