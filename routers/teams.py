"""Takım ve oyuncu arama endpoint'leri."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Engine, text

from db import get_engine
from models import PlayerSummary, TeamSummary, TeamSummaryDetail
from notifications import notify_search

router = APIRouter(tags=["teams"])


@router.get("/teams", response_model=list[TeamSummary], summary="Tüm ülkeleri oyuncu sayısıyla listeler")
def get_teams(engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT milliyet AS ulke, COUNT(*) AS oyuncu_sayisi
            FROM players
            WHERE milliyet IS NOT NULL AND milliyet != ''
              AND wc_squad_yil = 2026
            GROUP BY milliyet
            ORDER BY milliyet
        """)).mappings().fetchall()
    return [TeamSummary(**dict(r)) for r in rows]


@router.get("/teams/{ulke}/players", response_model=list[PlayerSummary], summary="Bir ülkenin oyuncularını listeler")
def get_team_players(ulke: str, engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id AS oyuncu_id, isim, mevki, milliyet
            FROM players
            WHERE milliyet = :ulke AND wc_squad_yil = 2026
            ORDER BY isim
        """), {"ulke": ulke}).mappings().fetchall()
    return [PlayerSummary(**dict(r)) for r in rows]


@router.get("/players/search", response_model=list[PlayerSummary], summary="Oyuncu adıyla arama")
def search_players(
    q: Optional[str] = Query(None),
    mevki_grup: Optional[str] = Query(None, description="GK|DEF|MID|FWD"),
    ulke: Optional[str] = Query(None),
    engine: Engine = Depends(get_engine),
):
    if q:
        notify_search(q)

    conditions = ["wc_squad_yil = 2026"]
    params: dict = {}

    if q and len(q.strip()) >= 2:
        conditions.append("unaccent(isim) ILIKE unaccent(:q)")
        params["q"] = f"%{q.strip()}%"

    if mevki_grup:
        mg = mevki_grup.upper()
        if mg == "GK":
            conditions.append("mevki ILIKE '%Goalkeeper%'")
        elif mg == "DEF":
            conditions.append("(mevki ILIKE '%Back%' OR mevki ILIKE '%Center Back%' OR mevki ILIKE '%Defensive%')")
        elif mg == "MID":
            conditions.append("(mevki ILIKE '%Midfield%' OR mevki ILIKE '%Attacking Mid%')")
        elif mg == "FWD":
            conditions.append("(mevki ILIKE '%Forward%' OR mevki ILIKE '%Wing%' OR mevki ILIKE '%Striker%')")

    if ulke:
        conditions.append("unaccent(milliyet) ILIKE unaccent(:ulke)")
        params["ulke"] = f"%{ulke.strip()}%"

    where = " AND ".join(conditions)
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT id AS oyuncu_id, isim, mevki, milliyet,
                   COALESCE(has_data, true) AS has_data
            FROM players
            WHERE {where}
            ORDER BY isim
            LIMIT 50
        """), params).mappings().fetchall()
    return [PlayerSummary(**dict(r)) for r in rows]


@router.get(
    "/teams/{ulke}/summary",
    response_model=TeamSummaryDetail,
    summary="Kadro özet istatistikleri",
)
def get_team_summary(ulke: str, engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
              COUNT(DISTINCT p.id)                                                        AS oyuncu_sayisi,
              ROUND(AVG(EXTRACT(YEAR FROM NOW()) - EXTRACT(YEAR FROM p.dogum_tarihi))::numeric, 1) AS ort_yas,
              COALESCE(SUM(COALESCE(pms.gol, 0)), 0)                                     AS toplam_gol,
              ROUND(COALESCE(SUM(COALESCE(pms.xg, 0)), 0)::numeric, 2)                   AS toplam_xg,
              COUNT(DISTINCT pms.mac_id)                                                  AS mac_sayisi
            FROM players p
            LEFT JOIN player_match_stats pms ON pms.oyuncu_id = p.id
            WHERE unaccent(p.milliyet) ILIKE unaccent(:ulke)
        """), {"ulke": ulke}).mappings().fetchone()

        best_row = conn.execute(text("""
            SELECT p.isim, SUM(COALESCE(pms.xg, 0)) AS toplam_xg
            FROM players p
            JOIN player_match_stats pms ON pms.oyuncu_id = p.id
            WHERE unaccent(p.milliyet) ILIKE unaccent(:ulke)
            GROUP BY p.id, p.isim
            ORDER BY toplam_xg DESC
            LIMIT 1
        """), {"ulke": ulke}).mappings().fetchone()

    if not row or not row["oyuncu_sayisi"]:
        raise HTTPException(status_code=404, detail=f"{ulke} için oyuncu bulunamadı.")

    return TeamSummaryDetail(
        ulke          = ulke,
        oyuncu_sayisi = int(row["oyuncu_sayisi"] or 0),
        ort_yas       = float(row["ort_yas"]) if row["ort_yas"] is not None else None,
        toplam_gol    = int(row["toplam_gol"] or 0),
        toplam_xg     = float(row["toplam_xg"] or 0),
        mac_sayisi    = int(row["mac_sayisi"] or 0),
        en_iyi_oyuncu = best_row["isim"] if best_row else None,
        en_iyi_xg     = float(best_row["toplam_xg"]) if best_row else None,
    )
