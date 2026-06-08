"""Maç simülatörü — gerçek xG/GK verilerine dayalı Poisson modeli."""

from __future__ import annotations
import random
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from db import get_engine

router = APIRouter(prefix="/simulate", tags=["simulate"])

# Liga ortalaması referansı (gol/maç başına)
_LEAGUE_AVG_GOALS = 1.35  # top 5 lig ortalaması

_SQL_TEAM_ATTACK = text("""
    SELECT
        p.id,
        p.isim,
        p.mevki,
        SUM(pm.xg)      AS toplam_xg,
        SUM(pm.xa)      AS toplam_xa,
        SUM(pm.gol)     AS toplam_gol,
        SUM(pm.dakika)  AS toplam_dk
    FROM players p
    JOIN player_match_stats pm ON p.id = pm.oyuncu_id
    WHERE p.milliyet = :milliyet
      AND pm.xg IS NOT NULL
    GROUP BY p.id, p.isim, p.mevki
    HAVING SUM(pm.dakika) > 90
    ORDER BY SUM(pm.xg) DESC
    LIMIT 20
""")

_SQL_TEAM_GK = text("""
    SELECT
        p.isim,
        AVG(gs.ga90)            AS ga90,
        AVG(gs.kurtaris_pct)    AS kurtaris_pct
    FROM players p
    JOIN player_gk_stats gs ON p.id = gs.oyuncu_id
    WHERE p.milliyet = :milliyet
    GROUP BY p.id, p.isim
    ORDER BY AVG(gs.ga90) ASC
    LIMIT 1
""")


def _team_stats(milliyet: str, engine) -> dict:
    """Takımın saldırı ve savunma istatistiklerini hesaplar."""
    with engine.connect() as c:
        attackers = c.execute(_SQL_TEAM_ATTACK, {"milliyet": milliyet}).mappings().all()
        gk_row    = c.execute(_SQL_TEAM_GK,    {"milliyet": milliyet}).mappings().first()

    if not attackers:
        raise HTTPException(404, f"'{milliyet}' için yeterli oyuncu verisi bulunamadı")

    players_out = []
    total_xg90  = 0.0
    for p in attackers:
        dk = float(p["toplam_dk"] or 0)
        if dk < 90:
            continue
        xg90 = float(p["toplam_xg"] or 0) / dk * 90
        xa90 = float(p["toplam_xa"] or 0) / dk * 90
        players_out.append({
            "id":    p["id"],
            "isim":  p["isim"],
            "mevki": p["mevki"],
            "xg90":  round(xg90, 3),
            "xa90":  round(xa90, 3),
            "gol":   int(p["toplam_gol"] or 0),
        })
        total_xg90 += xg90

    # Takım beklenen golü: en iyi 11'in ağırlıklı toplamı (ama üst sınırlı)
    team_xg = min(total_xg90, 4.5)

    # Savunma: kaleci ga90 verisinden
    if gk_row and gk_row["ga90"]:
        ga90         = float(gk_row["ga90"])
        gk_isim      = gk_row["isim"]
        kurtaris_pct = float(gk_row["kurtaris_pct"] or 70)
    else:
        ga90         = _LEAGUE_AVG_GOALS
        gk_isim      = "Bilinmiyor"
        kurtaris_pct = 70.0

    return {
        "xg_attack":    team_xg,
        "ga90":         ga90,
        "kurtaris_pct": kurtaris_pct,
        "gk_isim":      gk_isim,
        "players":      players_out[:11],
    }


def _simulate_match(stats_a: dict, stats_b: dict, n_sim: int = 1_000_000) -> dict:
    """n_sim Monte Carlo çalıştırır, sonuçları özetler."""
    rng = np.random.default_rng()

    # Her takım için beklenen gol:
    # lambda_a = takım_a_saldırı × (rakip_ga90 / lig_ort)
    def effective_lambda(attack: float, opp_ga90: float) -> float:
        factor = opp_ga90 / _LEAGUE_AVG_GOALS
        return max(0.1, attack * factor)

    lam_a = effective_lambda(stats_a["xg_attack"], stats_b["ga90"])
    lam_b = effective_lambda(stats_b["xg_attack"], stats_a["ga90"])

    goals_a = rng.poisson(lam_a, n_sim)
    goals_b = rng.poisson(lam_b, n_sim)

    win_a  = int((goals_a >  goals_b).sum())
    draw   = int((goals_a == goals_b).sum())
    win_b  = int((goals_a <  goals_b).sum())

    # En olası skor
    from collections import Counter
    scores  = Counter(zip(goals_a.tolist(), goals_b.tolist()))
    top3    = scores.most_common(3)
    sim_a, sim_b = top3[0][0]

    return {
        "skor_a":       sim_a,
        "skor_b":       sim_b,
        "xg_a":         round(lam_a, 2),
        "xg_b":         round(lam_b, 2),
        "olasilik_a":   round(win_a  / n_sim * 100, 1),
        "beraberlik":   round(draw   / n_sim * 100, 1),
        "olasilik_b":   round(win_b  / n_sim * 100, 1),
        "top_skorlar":  [{"skor": f"{a}-{b}", "pct": round(p/n_sim*100,1)} for (a,b),p in top3],
    }


def _build_timeline(stats_a: dict, stats_b: dict, skor_a: int, skor_b: int) -> list[dict]:
    """Gol dakikalarını ve atanları rastgele ama ağırlıklı oluşturur."""
    events: list[dict] = []
    minutes = sorted(random.sample(range(1, 91), min(skor_a + skor_b, 9)))

    def pick_scorer(players: list[dict]) -> dict | None:
        weights = [max(p["xg90"], 0.01) for p in players]
        total   = sum(weights)
        r       = random.uniform(0, total)
        cumul   = 0.0
        for p, w in zip(players, weights):
            cumul += w
            if r <= cumul:
                return p
        return players[0] if players else None

    idx_a = idx_b = 0
    for dakika in minutes:
        if idx_a < skor_a and (idx_b >= skor_b or random.random() < skor_a / (skor_a + skor_b)):
            scorer = pick_scorer(stats_a["players"])
            events.append({"dakika": dakika, "takim": "a",
                           "oyuncu": scorer["isim"] if scorer else "?", "tip": "gol"})
            idx_a += 1
        elif idx_b < skor_b:
            scorer = pick_scorer(stats_b["players"])
            events.append({"dakika": dakika, "takim": "b",
                           "oyuncu": scorer["isim"] if scorer else "?", "tip": "gol"})
            idx_b += 1

    return events


class SimulateRequest(BaseModel):
    takim_a: str
    takim_b: str


@router.post("", summary="İki milli takımı simüle eder")
def simulate_match(req: SimulateRequest) -> dict[str, Any]:
    engine  = get_engine()
    stats_a = _team_stats(req.takim_a, engine)
    stats_b = _team_stats(req.takim_b, engine)
    result  = _simulate_match(stats_a, stats_b)
    result["olaylar"]           = _build_timeline(stats_a, stats_b, result["skor_a"], result["skor_b"])
    result["kilit_oyuncular_a"] = stats_a["players"][:5]
    result["kilit_oyuncular_b"] = stats_b["players"][:5]
    result["gk_a"]              = stats_a["gk_isim"]
    result["gk_b"]              = stats_b["gk_isim"]
    return result
