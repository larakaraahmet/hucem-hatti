"""Fikstür ve maç sonuçları endpoint'leri."""

import json as _j
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Engine, text

from db import get_engine

router = APIRouter(tags=["fixtures"])


@router.get("/fixtures", summary="Fikstür takvimi (TR saatiyle)")
def get_fixtures(
    turnuva: Optional[str] = Query(None),
    tur:     Optional[str] = Query(None),
    grup:    Optional[str] = Query(None),
    durum:   Optional[str] = Query(None),
    gun:     Optional[str] = Query(None),
    limit:   int           = Query(default=50, ge=1, le=200),
    engine:  Engine        = Depends(get_engine),
):
    conditions = ["1=1"]
    params: dict = {"limit": limit}
    if turnuva:
        conditions.append("f.turnuva ILIKE :turnuva"); params["turnuva"] = f"%{turnuva}%"
    if tur:
        conditions.append("f.tur = :tur"); params["tur"] = tur
    if grup:
        conditions.append("f.grup = :grup"); params["grup"] = grup.upper()
    if durum:
        conditions.append("f.durum = :durum"); params["durum"] = durum
    if gun:
        conditions.append("(f.tarih_utc AT TIME ZONE 'Europe/Istanbul')::date = :gun::date"); params["gun"] = gun

    where = " AND ".join(conditions)
    sql = f"""
        SELECT f.id, f.turnuva, f.sezon, f.tur, f.grup, f.hafta,
               f.ev_takim, f.dep_takim,
               f.tarih_utc, (f.tarih_utc AT TIME ZONE 'Europe/Istanbul') AS tarih_tr,
               f.stadyum_isim, f.stadyum_sehir, f.stadyum_ulke,
               f.stadyum_kapasite, f.stadyum_rakim, f.stadyum_cim_turu,
               f.stadyum_lat::float AS stadyum_lat, f.stadyum_lon::float AS stadyum_lon,
               f.stadyum_acilis_yili, f.stadyum_boyut, f.stadyum_cerceve,
               f.durum, f.ev_gol, f.dep_gol, f.sonuc,
               f.muhtemel_kadro_ev, f.muhtemel_kadro_dep, f.teknik_detaylar
        FROM fixtures f
        WHERE {where}
        ORDER BY f.tarih_utc
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().fetchall()

    result = []
    for r in rows:
        row = dict(r)
        if row.get("tarih_utc"):
            row["tarih_utc"] = row["tarih_utc"].isoformat()
        if row.get("tarih_tr"):
            row["tarih_tr"] = row["tarih_tr"].strftime("%d.%m.%Y %H:%M")
        for field in ("muhtemel_kadro_ev", "muhtemel_kadro_dep", "teknik_detaylar"):
            if isinstance(row.get(field), str):
                try:
                    row[field] = _j.loads(row[field])
                except Exception:
                    pass
        result.append(row)
    return result


@router.get("/fixtures/{fixture_id}", summary="Tek fikstür detayı")
def get_fixture(fixture_id: int, engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT f.*, (f.tarih_utc AT TIME ZONE 'Europe/Istanbul') AS tarih_tr
            FROM fixtures f WHERE f.id = :id
        """), {"id": fixture_id}).mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Fikstür {fixture_id} bulunamadı.")
    d = dict(row)
    if d.get("tarih_utc"):
        d["tarih_utc"] = d["tarih_utc"].isoformat()
    if d.get("tarih_tr"):
        d["tarih_tr"] = d["tarih_tr"].strftime("%d.%m.%Y %H:%M")
    return d


@router.get("/matches/results", summary="Lig maç sonuçları")
def get_match_results(
    turnuva: Optional[str] = Query(None),
    sezon:   Optional[str] = Query(None),
    limit:   int           = Query(default=100, ge=1, le=500),
    engine:  Engine        = Depends(get_engine),
):
    params: dict = {"limit": limit}
    conds = ["1=1"]
    if turnuva:
        conds.append("turnuva ILIKE :turnuva"); params["turnuva"] = f"%{turnuva}%"
    if sezon:
        conds.append("sezon = :sezon"); params["sezon"] = sezon
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM match_results WHERE {' AND '.join(conds)} ORDER BY mac_tarihi DESC LIMIT :limit"), params).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/matches/odds", summary="Bahis oranları")
def get_odds(
    turnuva: Optional[str] = Query(None),
    sezon:   Optional[str] = Query(None),
    ev:      Optional[str] = Query(None),
    limit:   int           = Query(default=100, ge=1, le=500),
    engine:  Engine        = Depends(get_engine),
):
    params: dict = {"limit": limit}
    conds = ["1=1"]
    if turnuva:
        conds.append("turnuva ILIKE :turnuva"); params["turnuva"] = f"%{turnuva}%"
    if sezon:
        conds.append("sezon = :sezon"); params["sezon"] = sezon
    if ev:
        conds.append("ev_sahibi ILIKE :ev"); params["ev"] = f"%{ev}%"
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM betting_odds WHERE {' AND '.join(conds)} ORDER BY mac_tarihi DESC LIMIT :limit"), params).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/fixtures/groups", summary="WC 2026 grup fikstürü — grup bazında")
def get_fixtures_groups(engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT grup, ev_takim, dep_takim, tarih_utc, durum, ev_gol, dep_gol
            FROM fixtures WHERE tur = 'Grup' ORDER BY grup, tarih_utc
        """)).mappings().fetchall()
    result: dict = {}
    for r in rows:
        row = dict(r)
        if row.get("tarih_utc"):
            row["tarih_utc"] = row["tarih_utc"].isoformat()
        g = row.get("grup") or "?"
        result.setdefault(g, []).append(row)
    return result


@router.get("/fixtures/bracket", summary="WC 2026 eleme bracket")
def get_fixtures_bracket(engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT tur, ev_takim, dep_takim, tarih_utc, durum, ev_gol, dep_gol
            FROM fixtures
            WHERE tur IN ('Son 32','Son 16','Çeyrek Final','Yarı Final','3. lük','Final')
            ORDER BY
              CASE tur
                WHEN 'Son 32'       THEN 1
                WHEN 'Son 16'       THEN 2
                WHEN 'Çeyrek Final' THEN 3
                WHEN 'Yarı Final'   THEN 4
                WHEN '3. lük'       THEN 5
                WHEN 'Final'        THEN 6
              END, tarih_utc
        """)).mappings().fetchall()
    result: dict = {}
    for r in rows:
        row = dict(r)
        if row.get("tarih_utc"):
            row["tarih_utc"] = row["tarih_utc"].isoformat()
        t = row.get("tur") or "?"
        result.setdefault(t, []).append(row)
    return result
