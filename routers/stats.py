"""İstatistik lider tablosu endpoint'leri."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Engine, text

from db import get_engine
from notifications import notify_visit

router = APIRouter(prefix="/stats", tags=["stats"])

_FLAGS_MAP = {
    "France":"🇫🇷","Argentina":"🇦🇷","Portugal":"🇵🇹","Spain":"🇪🇸",
    "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Germany":"🇩🇪","Brazil":"🇧🇷","Netherlands":"🇳🇱",
    "Croatia":"🇭🇷","Morocco":"🇲🇦","Belgium":"🇧🇪","Denmark":"🇩🇰",
    "Mexico":"🇲🇽","Uruguay":"🇺🇾","Turkey":"🇹🇷","Japan":"🇯🇵",
    "United States":"🇺🇸","Colombia":"🇨🇴","Italy":"🇮🇹","Poland":"🇵🇱",
    "Serbia":"🇷🇸","Switzerland":"🇨🇭","Ecuador":"🇪🇨","Canada":"🇨🇦",
}


@router.get("/leaders", summary="Platform lider tablosu — ticker için")
def get_stats_leaders(engine: Engine = Depends(get_engine)):
    notify_visit()
    _SQL = """
    WITH totals AS (
        SELECT p.id, p.isim, p.milliyet,
               SUM(pms.gol)               AS toplam_gol,
               SUM(pms.asist)             AS toplam_asist,
               SUM(pms.xg)                AS toplam_xg,
               SUM(pms.sut)               AS toplam_sut,
               SUM(pms.dakika)            AS toplam_dk,
               COUNT(DISTINCT pms.mac_id) AS mac_sayisi
        FROM player_match_stats pms
        JOIN players p ON p.id = pms.oyuncu_id
        WHERE pms.dakika >= 90
        GROUP BY p.id, p.isim, p.milliyet
        HAVING SUM(pms.dakika) >= 270
    )
    SELECT * FROM totals ORDER BY toplam_gol DESC LIMIT 50
    """
    with engine.connect() as conn:
        rows = [dict(r._mapping) for r in conn.execute(text(_SQL))]
    if not rows:
        return []

    def flag(nat): return _FLAGS_MAP.get(nat, "🏳️")
    def short(name):
        parts = name.split()
        if len(parts) >= 3: return parts[-2]
        if len(parts) == 2: return parts[-1]
        return name

    per90_rows = [r for r in rows if (r["toplam_dk"] or 0) >= 450]
    best_gol   = max(rows, key=lambda r: r["toplam_gol"]   or 0)
    best_asist = max(rows, key=lambda r: r["toplam_asist"] or 0)
    best_xg    = max(rows, key=lambda r: float(r["toplam_xg"] or 0))
    best_mac   = max(rows, key=lambda r: r["mac_sayisi"]   or 0)
    best_g90   = max(per90_rows, key=lambda r: (r["toplam_gol"] or 0) / (r["toplam_dk"] / 90)) if per90_rows else best_gol
    best_xg90  = max(per90_rows, key=lambda r: float(r["toplam_xg"] or 0) / (r["toplam_dk"] / 90)) if per90_rows else best_xg
    best_sut   = max(rows, key=lambda r: r["toplam_sut"] or 0)

    return [
        {"icon":"⚽","label":"En Fazla Gol",       "value":f'{int(best_gol["toplam_gol"])} gol',      "player":short(best_gol["isim"]),   "flag":flag(best_gol["milliyet"])},
        {"icon":"🅰️","label":"En Fazla Asist",     "value":f'{int(best_asist["toplam_asist"])} asist',"player":short(best_asist["isim"]),"flag":flag(best_asist["milliyet"])},
        {"icon":"📐","label":"En Yüksek Toplam xG","value":f'{float(best_xg["toplam_xg"]):.1f} xG',   "player":short(best_xg["isim"]),   "flag":flag(best_xg["milliyet"])},
        {"icon":"🎯","label":"En Fazla Şut",        "value":f'{int(best_sut["toplam_sut"])} şut',     "player":short(best_sut["isim"]),  "flag":flag(best_sut["milliyet"])},
        {"icon":"📋","label":"En Çok Maç",          "value":f'{int(best_mac["mac_sayisi"])} maç',     "player":short(best_mac["isim"]),  "flag":flag(best_mac["milliyet"])},
        {"icon":"🏃","label":"Gol/90 Lideri",       "value":f'{(best_g90["toplam_gol"] or 0)/(best_g90["toplam_dk"]/90):.2f} /90', "player":short(best_g90["isim"]), "flag":flag(best_g90["milliyet"])},
        {"icon":"📈","label":"xG/90 Lideri",        "value":f'{float(best_xg90["toplam_xg"] or 0)/(best_xg90["toplam_dk"]/90):.2f} xG/90', "player":short(best_xg90["isim"]), "flag":flag(best_xg90["milliyet"])},
        {"icon":"🏆","label":"Platform Oyuncu Sayısı","value":"2.202 oyuncu","player":"WC2026 kadrosu","flag":"🌍"},
    ]


@router.get("/top", summary="Belirli bir metrikte en iyi oyuncular")
def get_stats_top(
    metric: str = Query(description="gol|asist|xg|sut|isabetli|gol90|xg90|asist90"),
    limit: int = Query(default=15, ge=1, le=50),
    engine: Engine = Depends(get_engine),
):
    METRIC_EXPRS = {
        "gol":      "SUM(pms.gol)",
        "asist":    "SUM(pms.asist)",
        "xg":       "CAST(SUM(pms.xg) AS float)",
        "sut":      "SUM(pms.sut)",
        "isabetli": "SUM(pms.isabetli_sut)",
        "gol90":    "SUM(pms.gol)::float / NULLIF(SUM(pms.dakika), 0) * 90",
        "xg90":     "CAST(SUM(pms.xg) AS float) / NULLIF(SUM(pms.dakika), 0) * 90",
        "asist90":  "SUM(pms.asist)::float / NULLIF(SUM(pms.dakika), 0) * 90",
    }
    if metric not in METRIC_EXPRS:
        raise HTTPException(status_code=400, detail=f"Geçersiz metrik: {metric}. Geçerli: {list(METRIC_EXPRS)}")

    expr = METRIC_EXPRS[metric]
    having = "HAVING SUM(pms.dakika) >= 270" if metric.endswith("90") else ""
    sql = f"""
    SELECT p.id AS oyuncu_id, p.isim, p.milliyet, p.mevki,
           {expr} AS deger,
           SUM(pms.dakika) AS toplam_dk,
           COUNT(DISTINCT pms.mac_id) AS mac_sayisi
    FROM player_match_stats pms
    JOIN players p ON p.id = pms.oyuncu_id
    WHERE pms.dakika >= 1
    GROUP BY p.id, p.isim, p.milliyet, p.mevki
    {having}
    ORDER BY deger DESC NULLS LAST
    LIMIT :limit
    """
    with engine.connect() as conn:
        rows = [dict(r._mapping) for r in conn.execute(text(sql), {"limit": limit})]
    return [
        {"oyuncu_id": r["oyuncu_id"], "isim": r["isim"], "milliyet": r["milliyet"],
         "mevki": r["mevki"], "deger": float(r["deger"] or 0),
         "toplam_dk": int(r["toplam_dk"] or 0), "mac_sayisi": int(r["mac_sayisi"] or 0)}
        for r in rows
    ]
