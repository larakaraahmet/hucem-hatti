"""Grup Aşaması Simülatörü — WC 2026 tüm grup fazını simüle eder."""

from __future__ import annotations
import random
from typing import Any

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from db import get_engine
from routers.simulate import _team_stats, _simulate_match, _LEAGUE_AVG_GOALS

router = APIRouter(prefix="/group-simulate", tags=["group-simulate"])

# ─── Türkçe → İngilizce takım adı eşleşmesi ─────────────────────────────────
TR_TO_EN: dict[str, str] = {
    "ABD":            "United States",
    "Almanya":        "Germany",
    "Arjantin":       "Argentina",
    "Avustralya":     "Australia",
    "Avusturya":      "Austria",
    "Belçika":        "Belgium",
    "Bosna Hersek":   "Bosnia and Herzegovina",
    "Brezilya":       "Brazil",
    "Çekya":          "Czech Republic",
    "Cezayir":        "Algeria",
    "Curaçao":        "Curaçao",
    "Ekvador":        "Ecuador",
    "Fas":            "Morocco",
    "Fildişi Sahili": "Ivory Coast",
    "Fransa":         "France",
    "G.Kore":         "South Korea",
    "Gana":           "Ghana",
    "Güney Afrika":   "South Africa",
    "Haiti":          "Haiti",
    "Hırvatistan":    "Croatia",
    "Hollanda":       "Netherlands",
    "İngiltere":      "England",
    "Irak":           "Iraq",
    "İran":           "Iran",
    "İskoçya":        "Scotland",
    "İspanya":        "Spain",
    "İsveç":          "Sweden",
    "İsviçre":        "Switzerland",
    "Japonya":        "Japan",
    "Kanada":         "Canada",
    "Katar":          "Qatar",
    "Kolombiya":      "Colombia",
    "Kongo":          "Congo DR",
    "Meksika":        "Mexico",
    "Mısır":          "Egypt",
    "Norveç":         "Norway",
    "Özbekistan":     "Uzbekistan",
    "Panama":         "Panama",
    "Paraguay":       "Paraguay",
    "Portekiz":       "Portugal",
    "S. Arabistan":   "Saudi Arabia",
    "Senegal":        "Senegal",
    "Tunus":          "Tunisia",
    "Türkiye":        "Turkey",
    "Ürdün":          "Jordan",
    "Uruguay":        "Uruguay",
    "Yeni Zelanda":   "New Zealand",
    "Yeşil Burun":    "Cape Verde Islands",
}

_SQL_GROUP_FIXTURES = text("""
    SELECT ev_takim, dep_takim
    FROM fixtures
    WHERE grup = :grup
      AND ev_takim NOT LIKE 'Group%'
      AND dep_takim NOT LIKE 'Group%'
      AND ev_takim NOT LIKE 'Round%'
      AND dep_takim NOT LIKE 'Round%'
      AND ev_takim NOT LIKE 'Quarter%'
      AND dep_takim NOT LIKE 'Quarter%'
      AND ev_takim NOT LIKE 'Semi%'
      AND dep_takim NOT LIKE 'Semi%'
      AND ev_takim NOT LIKE 'Third%'
      AND dep_takim NOT LIKE 'Third%'
    ORDER BY id
""")

_SQL_ALL_GROUPS = text("""
    SELECT DISTINCT grup FROM fixtures
    WHERE grup IS NOT NULL
      AND grup NOT LIKE 'Group%'
      AND grup NOT LIKE 'Round%'
      AND grup NOT LIKE 'Quarter%'
      AND grup NOT LIKE 'Semi%'
      AND grup NOT LIKE 'Third%'
      AND length(grup) = 1
    ORDER BY grup
""")


def _simulate_group(fixtures: list[tuple], team_stats: dict, n_sim: int = 50_000) -> dict:
    """
    n_sim kez tüm grup maçlarını simüle et.
    Her simülasyonda puan tablosunu hesapla.
    Döndür: her takım için {avg_pts, top2_pct, winner_pct, avg_gd}.
    """
    teams = list(team_stats.keys())
    n_teams = len(teams)

    # Akümülatörler
    top2_count   = {t: 0 for t in teams}
    winner_count = {t: 0 for t in teams}
    total_pts    = {t: 0 for t in teams}
    total_gd     = {t: 0 for t in teams}

    # Her maç için numpy vektörel simülasyon (vectorized across n_sim)
    rng = np.random.default_rng()

    def effective_lambda(attack: float, opp_ga90: float) -> float:
        factor = opp_ga90 / _LEAGUE_AVG_GOALS
        return max(0.1, attack * factor)

    # Her maç: (ev, dep) → n_sim boyutlu gol dizileri
    match_results: list[tuple] = []
    for ev_tr, dep_tr in fixtures:
        ev_en  = TR_TO_EN.get(ev_tr,  ev_tr)
        dep_en = TR_TO_EN.get(dep_tr, dep_tr)
        if ev_en not in team_stats or dep_en not in team_stats:
            continue
        sa = team_stats[ev_en]
        sb = team_stats[dep_en]
        lam_a = effective_lambda(sa["xg_attack"], sb["ga90"])
        lam_b = effective_lambda(sb["xg_attack"], sa["ga90"])
        goals_a = rng.poisson(lam_a, n_sim)
        goals_b = rng.poisson(lam_b, n_sim)
        match_results.append((ev_en, dep_en, goals_a, goals_b))

    # Her simülasyon için puan tablosu
    for i in range(n_sim):
        pts = {t: 0 for t in teams}
        gd  = {t: 0 for t in teams}
        gf  = {t: 0 for t in teams}

        for ev_en, dep_en, goals_a_arr, goals_b_arr in match_results:
            a = int(goals_a_arr[i])
            b = int(goals_b_arr[i])
            gd[ev_en]  += a - b
            gd[dep_en] += b - a
            gf[ev_en]  += a
            gf[dep_en] += b
            if a > b:
                pts[ev_en]  += 3
            elif a == b:
                pts[ev_en]  += 1
                pts[dep_en] += 1
            else:
                pts[dep_en] += 3

        # Sıralama: puan → gol farkı → atılan gol
        ranking = sorted(teams, key=lambda t: (pts[t], gd[t], gf[t]), reverse=True)
        winner_count[ranking[0]] += 1
        for t in ranking[:2]:
            top2_count[t] += 1
        for t in teams:
            total_pts[t] += pts[t]
            total_gd[t]  += gd[t]

    return {
        t: {
            "avg_pts":    round(total_pts[t] / n_sim, 1),
            "avg_gd":     round(total_gd[t]  / n_sim, 1),
            "top2_pct":   round(top2_count[t]   / n_sim * 100, 1),
            "winner_pct": round(winner_count[t]  / n_sim * 100, 1),
        }
        for t in teams
    }


class GroupSimRequest(BaseModel):
    grup: str  # "A" – "L"


@router.get("/groups", summary="Tüm grupları listele")
def list_groups() -> list[str]:
    engine = get_engine()
    with engine.connect() as c:
        rows = c.execute(_SQL_ALL_GROUPS).fetchall()
    return [r[0] for r in rows]


@router.post("", summary="Grup aşamasını simüle et")
def simulate_group(req: GroupSimRequest) -> dict[str, Any]:
    grup = req.grup.upper()
    engine = get_engine()

    # Maçları DB'den al
    with engine.connect() as c:
        rows = c.execute(_SQL_GROUP_FIXTURES, {"grup": grup}).fetchall()

    if not rows:
        raise HTTPException(404, f"'{grup}' grubu için maç bulunamadı")

    # Eşsiz takımları bul
    tr_teams: set[str] = set()
    for ev, dep in rows:
        tr_teams.add(ev)
        tr_teams.add(dep)

    # Her takım için istatistik çek (hata toleranslı)
    team_stats: dict[str, dict] = {}
    missing: list[str] = []
    for tr_name in tr_teams:
        en_name = TR_TO_EN.get(tr_name, tr_name)
        try:
            team_stats[en_name] = _team_stats(en_name, engine)
        except Exception:
            missing.append(f"{tr_name} ({en_name})")
            # Veri yoksa varsayılan değerler kullan
            team_stats[en_name] = {
                "xg_attack":    1.0,
                "ga90":         1.35,
                "kurtaris_pct": 70.0,
                "gk_isim":      "—",
                "players":      [],
            }

    # Grup simülasyonu
    result = _simulate_group(list(rows), team_stats, n_sim=50_000)

    # Sıralı takım listesi
    ranking = sorted(result.keys(), key=lambda t: result[t]["top2_pct"], reverse=True)

    # Maç listesi (Türkçe isimler + İngilizce eşlemesi)
    fixtures_out = [
        {
            "ev":     TR_TO_EN.get(ev,  ev),
            "dep":    TR_TO_EN.get(dep, dep),
            "ev_tr":  ev,
            "dep_tr": dep,
        }
        for ev, dep in rows
    ]

    return {
        "grup":      grup,
        "takim_siralama": ranking,
        "sonuclar":  result,
        "maclar":    fixtures_out,
        "veri_eksik": missing,
        "n_sim":     50_000,
    }
