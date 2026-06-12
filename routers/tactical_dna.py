"""Taktiksel DNA — her milli takımın oyun stili vektörü ve arketip sınıflaması."""

from __future__ import annotations
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db import get_engine

router = APIRouter(prefix="/tactical-dna", tags=["tactical-dna"])

_SQL_TEAM_DNA = text("""
    SELECT
        p.milliyet,
        COUNT(DISTINCT p.id)                                                AS oyuncu_n,
        -- Saldırı gücü: xG / maç (tüm kaynaklar)
        AVG(pm.xg)                                                          AS avg_xg_per_mac,
        -- Yaratıcılık: xA / maç (tüm kaynaklar)
        AVG(COALESCE(pm.xa, 0))                                             AS avg_xa_per_mac,
        -- İlerleme: progressive_pass/maç (sadece statsbomb, understat'ta 0)
        AVG(CASE WHEN pm.source = 'statsbomb' THEN pm.progressive_pass ELSE NULL END)
                                                                             AS avg_prog_per_mac,
        -- Şut kalitesi: xG/şut
        CASE WHEN SUM(pm.sut) > 0 THEN SUM(pm.xg) / SUM(pm.sut) ELSE 0 END AS xg_per_shot,
        -- Şut hacmi: şut/maç (tüm kaynaklar)
        AVG(pm.sut)                                                         AS avg_sut_per_mac,
        COUNT(*) AS mac_n
    FROM players p
    JOIN player_match_stats pm ON p.id = pm.oyuncu_id
    WHERE pm.xg IS NOT NULL OR pm.xa IS NOT NULL
    GROUP BY p.milliyet
    HAVING COUNT(*) >= 10
    ORDER BY avg_xg_per_mac DESC NULLS LAST
""")


def _classify(xg90, xa90, prog90, xg_per_shot, sut90) -> tuple[str, str]:
    """
    Beş boyutlu vektörden oyun stili arketipini belirle.
    Döndür: (arketip_isim, renk_hex)
    """
    # Normalize edilmiş değerler (ham data ortalamaları)
    high_xg   = xg90 > 0.65
    high_xa   = xa90 > 0.08
    high_prog = prog90 > 0.85
    high_qual = xg_per_shot > 0.14
    high_vol  = sut90 > 2.5

    if high_prog and high_xa:
        return ("⚡ Tika-Taka", "#38bdf8")       # İspanya tarzı
    if high_vol and not high_qual:
        return ("🔥 Baskı Futbolu", "#f97316")    # Agresif, yüksek şut
    if high_qual and not high_vol:
        return ("🎯 Fırsatçı", "#a78bfa")         # Az ama kaliteli
    if high_xg and high_xa:
        return ("💥 Ofansif Güç", "#f59e0b")      # Her iki kanatta güçlü
    if high_prog and not high_xa:
        return ("📐 Pozisyonel", "#22c55e")        # İlerleme odaklı
    return ("🛡️ Dengeli", "#94a3b8")


@router.get("", summary="Tüm takımların taktiksel DNA profili")
def all_teams_dna() -> list[dict]:
    engine = get_engine()
    with engine.connect() as c:
        rows = c.execute(_SQL_TEAM_DNA).mappings().all()

    result = []
    for r in rows:
        # avg per match → scale to per-90 equivalent
        xg90        = float(r["avg_xg_per_mac"]   or 0) * 1.28
        xa90        = float(r["avg_xa_per_mac"]    or 0) * 1.28
        prog_per_mac= float(r["avg_prog_per_mac"]  or 0)  # avg prog passes / match (statsbomb only)
        xg_per_shot = float(r["xg_per_shot"]       or 0)
        sut_per_mac = float(r["avg_sut_per_mac"]   or 0)

        # Normalize to 0–10 scale
        # max values based on real data: xg90~0.8, xa90~0.14, prog~3.0/mac, xg/shot~0.17, sut~2.5/mac
        scores = {
            "saldiri":     round(min(xg90        / 0.8  * 10, 10), 1),
            "yaraticilik": round(min(xa90        / 0.14 * 10, 10), 1),
            "ilerleme":    round(min(prog_per_mac / 3.0  * 10, 10), 1),
            "kal_sut":     round(min(xg_per_shot  / 0.17 * 10, 10), 1),
            "hacim":       round(min(sut_per_mac  / 2.5  * 10, 10), 1),
        }
        arketip, renk = _classify(xg90, xa90, prog_per_mac / 3.0 * 1.5, xg_per_shot, sut_per_mac / 2.5 * 4.0)

        result.append({
            "milliyet":   r["milliyet"],
            "arketip":    arketip,
            "renk":       renk,
            "scores":     scores,
            "raw": {
                "xg90":        round(xg90, 3),
                "xa90":        round(xa90, 3),
                "prog_per_mac": round(prog_per_mac, 2) if prog_per_mac else None,
                "xg_per_shot": round(xg_per_shot, 3),
                "sut_per_mac": round(sut_per_mac, 2),
            }
        })
    return result


@router.get("/{milliyet}", summary="Tek takımın DNA profili")
def team_dna(milliyet: str) -> dict:
    all_data = all_teams_dna()
    for item in all_data:
        if item["milliyet"].lower() == milliyet.lower():
            return item
    raise HTTPException(404, f"'{milliyet}' için yeterli veri yok")
