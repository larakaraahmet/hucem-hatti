"""Oyuncu endpoint'leri — /player/{id}/* rotaları."""

import statistics as _stat
import urllib.parse
import urllib.request
import json as _json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Engine, text

from db import get_engine, fetch_player_base, metrics_or_empty, _SQL_SHOTS
from models import (
    CompetitionStatsRecord, InsightResponse, Per90Metrics,
    PercentileMetrics, PercentilesResponse, PlayerMatchRecord,
    PlayerProfileResponse, ShotResponse, SimilarPlayerResponse,
)
from notifications import notify_player_view
from similarity import find_similar_players

try:
    from insights import generate_insight_for_player
    _insights_available = True
except ImportError:
    _insights_available = False

router = APIRouter(prefix="/player", tags=["players"])

# ── Fotoğraf önbelleği (process başına sabit, yeterli) ──────────────────────
_photo_cache: dict[int, str | None] = {}

_SQL_CLUB_TEAM = """
SELECT takim, lig
FROM player_external_stats
WHERE oyuncu_id = :player_id
  AND takim IS NOT NULL
ORDER BY
    CASE WHEN sezon = '2025/26' THEN 0
         WHEN sezon = '2024/25' THEN 1
         WHEN sezon = '2023/24' THEN 2
         ELSE 3 END,
    COALESCE(mac_sayisi, 0) DESC
LIMIT 1
"""


# ---------------------------------------------------------------------------
# Oyuncu profili
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}",
    response_model=PlayerProfileResponse,
    summary="Oyuncu profili ve 90 dakika başına metrikleri",
)
def get_player_profile(player_id: int, engine: Engine = Depends(get_engine)):
    base    = fetch_player_base(player_id, engine)
    metrics = metrics_or_empty(player_id, engine)

    notify_player_view(
        player_id,
        base.get("isim", str(player_id)),
        base.get("mevki"),
        base.get("milliyet"),
    )

    club_takim = club_lig = None
    with engine.connect() as conn:
        club_row = conn.execute(text(_SQL_CLUB_TEAM), {"player_id": player_id}).mappings().fetchone()
    if club_row:
        club_takim = club_row["takim"]
        raw_lig = club_row["lig"] or ""
        club_lig = " ".join(w for w in raw_lig.split() if not w.startswith("20")) or raw_lig or None
    if not club_takim and base.get("current_club"):
        club_takim = base["current_club"]
        club_lig   = base.get("current_club_ulke")

    has_data_val = base.get("has_data", True)
    if has_data_val is None:
        has_data_val = metrics["mac_sayisi"] > 0 or club_takim is not None

    return PlayerProfileResponse(
        oyuncu_id     = player_id,
        isim          = base["isim"],
        mevki         = base["mevki"],
        milliyet      = base["milliyet"],
        dogum_tarihi  = base["dogum_tarihi"],
        mac_sayisi    = metrics["mac_sayisi"],
        toplam_dakika = metrics["toplam_dakika"],
        per90         = Per90Metrics(**metrics["per90"]),
        club_takim    = club_takim,
        club_lig      = club_lig,
        has_data      = bool(has_data_val),
    )


# ---------------------------------------------------------------------------
# Benzer oyuncular
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/similar",
    response_model=list[SimilarPlayerResponse],
    summary="Metrik vektörüne göre en benzer oyuncular",
)
def get_similar_players(
    player_id: int,
    top_n: int = Query(default=5, ge=1, le=20),
    same_position_only: bool = Query(default=False),
    min_minutes: int = Query(default=90, ge=1),
    engine: Engine = Depends(get_engine),
):
    try:
        results = find_similar_players(
            player_id, engine,
            top_n=top_n,
            min_minutes=min_minutes,
            same_position_only=same_position_only,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return [
        SimilarPlayerResponse(
            oyuncu_id = r["oyuncu_id"],
            isim      = r["isim"],
            mevki     = r["mevki"],
            benzerlik = r["benzerlik"],
            per90     = Per90Metrics(**r["per90"]),
        )
        for r in results
    ]


# ---------------------------------------------------------------------------
# Şutlar
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/shots",
    response_model=list[ShotResponse],
    summary="Şut haritası verisi",
)
def get_player_shots(
    player_id: int,
    turnuva: Optional[str] = Query(None),
    engine: Engine = Depends(get_engine),
):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text(_SQL_SHOTS), {"player_id": player_id, "turnuva": turnuva}).mappings().fetchall()
    return [ShotResponse(**dict(row)) for row in rows]


# ---------------------------------------------------------------------------
# Yüzdelik dilimler
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/percentiles",
    response_model=PercentilesResponse,
    summary="Radar/pizza grafik için yüzdelik dilimler",
)
def get_player_percentiles(
    player_id: int,
    min_minutes: int = Query(default=90, ge=1),
    engine: Engine = Depends(get_engine),
):
    metrics = metrics_or_empty(player_id, engine)
    return PercentilesResponse(
        oyuncu_id     = player_id,
        isim          = metrics.get("isim", ""),
        mevki         = metrics.get("mevki"),
        mac_sayisi    = metrics["mac_sayisi"],
        toplam_dakika = metrics["toplam_dakika"],
        per90         = Per90Metrics(**metrics["per90"]),
        percentile    = PercentileMetrics(**metrics["percentile"]),
    )


# ---------------------------------------------------------------------------
# Fotoğraf
# ---------------------------------------------------------------------------

def _find_photo(name: str) -> str | None:
    wiki = name.replace(" ", "_")
    try:
        req = urllib.request.Request(
            f"https://en.wikipedia.org/api/rest_v1/page/summary/{urllib.parse.quote(wiki)}",
            headers={"User-Agent": "HuCemHatti/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as r:
            data = _json.loads(r.read())
            if data.get("thumbnail"):
                return data["thumbnail"]["source"]
    except Exception:
        pass
    try:
        req = urllib.request.Request(
            f"https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p={urllib.parse.quote(name)}",
            headers={"User-Agent": "HuCemHatti/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as r:
            data = _json.loads(r.read())
            pl = data.get("players") or []
            if pl:
                return pl[0].get("strThumb") or pl[0].get("strCutout") or None
    except Exception:
        pass
    return None


@router.get("/{player_id}/photo", summary="Oyuncu fotoğrafı URL'si")
def get_player_photo(player_id: int, engine: Engine = Depends(get_engine)):
    if player_id in _photo_cache:
        return {"url": _photo_cache[player_id]}
    base  = fetch_player_base(player_id, engine)
    name  = base["isim"]
    parts = name.strip().split()
    short = f"{parts[0]} {parts[-1]}" if len(parts) >= 2 else name
    url   = _find_photo(short) or _find_photo(name)
    _photo_cache[player_id] = url
    return {"url": url}


# ---------------------------------------------------------------------------
# Maç geçmişi
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/matches",
    response_model=list[PlayerMatchRecord],
    summary="Oyuncunun analiz edilen maçlarının listesi",
)
def get_player_matches(
    player_id: int,
    turnuva: Optional[str] = Query(None),
    engine: Engine = Depends(get_engine),
):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                m.id              AS mac_id,
                m.tarih::text     AS tarih,
                m.turnuva,
                t1.isim           AS ev_takim,
                t2.isim           AS deplasman_takim,
                pms.dakika,
                COALESCE(pms.gol,             0) AS gol,
                COALESCE(pms.asist,           0) AS asist,
                COALESCE(pms.sut,             0) AS sut,
                COALESCE(pms.isabetli_sut,    0) AS isabetli_sut,
                pms.xg,
                pms.xa,
                COALESCE(pms.progressive_pass, 0) AS progressive_pass,
                s.isim            AS saha_isim,
                s.sehir           AS saha_sehir,
                s.ulke            AS saha_ulke,
                s.kapasite        AS saha_kapasite,
                s.rakim           AS saha_rakim,
                s.cim_turu        AS saha_cim_turu,
                s.lat::float      AS saha_lat,
                s.lon::float      AS saha_lon,
                s.acilis_yili     AS saha_acilis_yili,
                s.boyut           AS saha_boyut
            FROM player_match_stats pms
            JOIN matches m  ON m.id  = pms.mac_id
            JOIN teams   t1 ON t1.id = m.ev_takim_id
            JOIN teams   t2 ON t2.id = m.deplasman_takim_id
            LEFT JOIN stadiums s ON s.id = m.saha_id
            WHERE pms.oyuncu_id = :player_id
              AND (:turnuva IS NULL OR m.turnuva = :turnuva)
            ORDER BY m.tarih DESC
        """), {"player_id": player_id, "turnuva": turnuva}).mappings().fetchall()

        if not rows:
            rows = conn.execute(text("""
                SELECT
                    m.id              AS mac_id,
                    m.tarih::text     AS tarih,
                    m.turnuva,
                    t1.isim           AS ev_takim,
                    t2.isim           AS deplasman_takim,
                    NULL::int         AS dakika,
                    COALESCE(SUM(CASE WHEN s2.gol_mu THEN 1 ELSE 0 END), 0)  AS gol,
                    0                                                          AS asist,
                    COUNT(s2.id)                                               AS sut,
                    COALESCE(SUM(CASE WHEN s2.gol_mu THEN 1 ELSE 0 END), 0)  AS isabetli_sut,
                    ROUND(SUM(COALESCE(s2.xg, 0))::numeric, 3)               AS xg,
                    NULL::numeric                                              AS xa,
                    0                                                          AS progressive_pass,
                    st.isim           AS saha_isim,
                    st.sehir          AS saha_sehir,
                    st.ulke           AS saha_ulke,
                    st.kapasite       AS saha_kapasite,
                    st.rakim          AS saha_rakim,
                    st.cim_turu       AS saha_cim_turu,
                    st.lat::float     AS saha_lat,
                    st.lon::float     AS saha_lon,
                    st.acilis_yili    AS saha_acilis_yili,
                    st.boyut          AS saha_boyut
                FROM shots s2
                JOIN matches m   ON m.id   = s2.mac_id
                JOIN teams   t1  ON t1.id  = m.ev_takim_id
                JOIN teams   t2  ON t2.id  = m.deplasman_takim_id
                LEFT JOIN stadiums st ON st.id = m.saha_id
                WHERE s2.oyuncu_id = :player_id
                  AND (:turnuva IS NULL OR m.turnuva = :turnuva)
                GROUP BY m.id, m.tarih, m.turnuva, t1.isim, t2.isim,
                         st.isim, st.sehir, st.ulke, st.kapasite, st.rakim,
                         st.cim_turu, st.lat, st.lon, st.acilis_yili, st.boyut
                ORDER BY m.tarih DESC
            """), {"player_id": player_id, "turnuva": turnuva}).mappings().fetchall()

    return [PlayerMatchRecord(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# Turnuvalar
# ---------------------------------------------------------------------------

@router.get("/{player_id}/competitions", summary="Oyuncunun katıldığı turnuva listesi")
def get_player_competitions(player_id: int, engine: Engine = Depends(get_engine)):
    import datetime as _dt
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        match_rows = conn.execute(text("""
            SELECT m.turnuva, COUNT(*) AS mac_sayisi,
                   SUM(COALESCE(pms.dakika, 0)) AS dakika,
                   SUM(COALESCE(pms.gol,    0)) AS gol,
                   SUM(COALESCE(pms.asist,  0)) AS asist,
                   MAX(m.tarih)                 AS son_mac
            FROM player_match_stats pms
            JOIN matches m ON m.id = pms.mac_id
            WHERE pms.oyuncu_id = :player_id
            GROUP BY m.turnuva
        """), {"player_id": player_id}).mappings().fetchall()

        shot_rows = conn.execute(text("""
            SELECT m.turnuva, COUNT(DISTINCT m.id) AS mac_sayisi,
                   0 AS dakika,
                   SUM(CASE WHEN s.gol_mu THEN 1 ELSE 0 END) AS gol,
                   0 AS asist, MAX(m.tarih) AS son_mac
            FROM shots s
            JOIN matches m ON m.id = s.mac_id
            WHERE s.oyuncu_id = :player_id
            GROUP BY m.turnuva
        """), {"player_id": player_id}).mappings().fetchall()

        ext_rows = conn.execute(text("""
            SELECT lig || ' ' || sezon AS turnuva,
                   COALESCE(mac_sayisi, 0) AS mac_sayisi,
                   COALESCE(dakika,     0) AS dakika,
                   COALESCE(gol,        0) AS gol,
                   COALESCE(asist,      0) AS asist,
                   NULL AS son_mac
            FROM player_external_stats
            WHERE oyuncu_id = :player_id
            ORDER BY sezon DESC
        """), {"player_id": player_id}).mappings().fetchall()

    seen: set[str] = set()
    result = []
    for r in match_rows:
        seen.add(r["turnuva"])
        result.append({**dict(r), "has_match_data": True})
    for r in shot_rows:
        if r["turnuva"] not in seen:
            seen.add(r["turnuva"])
            result.append({**dict(r), "has_match_data": True})
    for r in ext_rows:
        if r["turnuva"] not in seen:
            seen.add(r["turnuva"])
            result.append({**dict(r), "has_match_data": False})

    def _sort_key(x):
        v = x.get("son_mac")
        if v is None:
            return _dt.date(1900, 1, 1)
        if isinstance(v, str):
            try:
                return _dt.date.fromisoformat(v[:10])
            except Exception:
                return _dt.date(1900, 1, 1)
        return v

    result.sort(key=_sort_key, reverse=True)
    for r in result:
        if isinstance(r.get("son_mac"), _dt.date):
            r["son_mac"] = r["son_mac"].isoformat()
    return result


# ---------------------------------------------------------------------------
# Turnuva bazlı özet
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/competition-stats",
    response_model=list[CompetitionStatsRecord],
    summary="Oyuncunun turnuva bazında özet istatistikleri",
)
def get_competition_stats(player_id: int, engine: Engine = Depends(get_engine)):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                m.turnuva,
                COUNT(*)                             AS mac_sayisi,
                SUM(COALESCE(pms.dakika,        0))  AS dakika,
                SUM(COALESCE(pms.gol,           0))  AS gol,
                SUM(COALESCE(pms.asist,         0))  AS asist,
                SUM(COALESCE(pms.xg,          0.0))  AS xg,
                SUM(COALESCE(pms.xa,          0.0))  AS xa,
                SUM(COALESCE(pms.sut,           0))  AS sut,
                SUM(COALESCE(pms.isabetli_sut,  0))  AS isabetli_sut
            FROM player_match_stats pms
            JOIN matches m ON m.id = pms.mac_id
            WHERE pms.oyuncu_id = :player_id
            GROUP BY m.turnuva
            ORDER BY SUM(COALESCE(pms.dakika, 0)) DESC
        """), {"player_id": player_id}).mappings().fetchall()
    return [CompetitionStatsRecord(**dict(r)) for r in rows]


# ---------------------------------------------------------------------------
# Arketip
# ---------------------------------------------------------------------------

def _compute_archetype(per90: dict) -> str:
    xg  = per90.get("xg90", 0) or 0
    xa  = per90.get("xa90", 0) or 0
    gol = per90.get("gol90", 0) or 0
    sut = per90.get("sut90", 0) or 0
    ist = per90.get("isabetli90", 0) or 0
    pp  = per90.get("prog_pass90", 0) or 0
    if xg >= 0.35 and sut >= 3.0:  return "Box Threat"
    if xg >= 0.25 and gol >= 0.5:  return "Finisher"
    if xa >= 0.25 and pp >= 5.0:   return "Creator"
    if xa >= 0.20:                  return "Chance Creator"
    if pp >= 7.0:                   return "Deep Playmaker"
    if pp >= 4.0 and xa >= 0.12:   return "Progressive Carrier"
    if sut >= 3.0 and xg < 0.20:   return "Volume Shooter"
    if ist >= 1.5 and xg >= 0.15:  return "Direct Winger"
    if pp >= 3.0:                   return "Possession Hub"
    return "Balanced"


@router.get("/{player_id}/archetype", summary="Oyuncu arketipi / izci etiketi")
def get_player_archetype(player_id: int, engine: Engine = Depends(get_engine)):
    metrics = metrics_or_empty(player_id, engine)
    return {"oyuncu_id": player_id, "archetype": _compute_archetype(metrics["per90"])}


# ---------------------------------------------------------------------------
# Piyasa değeri & ek veriler
# ---------------------------------------------------------------------------

@router.get("/{player_id}/market", summary="Transfermarkt piyasa değeri")
def get_player_market(player_id: int, engine: Engine = Depends(get_engine)):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        row = conn.execute(text("SELECT * FROM player_market_values WHERE oyuncu_id = :id"), {"id": player_id}).mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Transfermarkt verisi bulunamadı.")
    d = dict(row)
    if d.get("sozlesme_bitis"):
        d["sozlesme_bitis"] = str(d["sozlesme_bitis"])
    if d.get("guncelleme"):
        d["guncelleme"] = d["guncelleme"].isoformat()
    return d


@router.get("/{player_id}/gk-stats", summary="Kaleci sezonluk istatistikleri")
def get_player_gk_stats(player_id: int, engine: Engine = Depends(get_engine)):
    fetch_player_base(player_id, engine)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT lig, sezon, takim, mac_sayisi, dakika,
                       yenilen_gol, ga90, isabetli_sut_karsi, kurtaris, kurtaris_pct,
                       gol_yenmeme, gol_yenmeme_pct, galibiyet, beraberlik, maglubiyet,
                       penalti_deneme, penalti_kurtaris, kaynak
                FROM player_gk_stats
                WHERE oyuncu_id = :id
                ORDER BY sezon DESC, mac_sayisi DESC NULLS LAST
            """), {"id": player_id}).mappings().fetchall()
        return [dict(r) for r in rows]
    except Exception:
        return []


@router.get("/{player_id}/xg-trend", summary="Understat xG/xA sezon trendi")
def get_player_xg_trend(player_id: int, engine: Engine = Depends(get_engine)):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT sezon, lig, mac_sayisi, dakika, gol, xg, asist, xa, xg_zincir, xg_yaratma
            FROM player_xg_trends
            WHERE oyuncu_id = :id
            ORDER BY sezon, lig
        """), {"id": player_id}).mappings().fetchall()
    return [dict(r) for r in rows]


@router.get("/{player_id}/advanced-value", summary="xT / action value metrikleri")
def get_player_advanced_value(
    player_id: int,
    mac_limit: int = Query(default=20, ge=1, le=100),
    engine: Engine = Depends(get_engine),
):
    fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT pxt.mac_id, m.tarih::text AS tarih, m.turnuva,
                   pxt.xt_toplam, pxt.xt_ofansif, pxt.xt_defansif,
                   pxt.action_value, pxt.tasima_xt, pxt.pas_xt, pxt.sut_xt,
                   pxt.dakika, pxt.kaynak
            FROM player_xt_stats pxt
            JOIN matches m ON m.id = pxt.mac_id
            WHERE pxt.oyuncu_id = :id
            ORDER BY m.tarih DESC
            LIMIT :lim
        """), {"id": player_id, "lim": mac_limit}).mappings().fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="xT verisi bulunamadı.")
    data = [dict(r) for r in rows]
    xt_vals = [float(r["xt_toplam"] or 0) for r in data]
    av_vals = [float(r["action_value"] or 0) for r in data]
    summary = {
        "mac_sayisi":       len(data),
        "xt_toplam_ort":    round(_stat.mean(xt_vals), 4) if xt_vals else 0,
        "xt_toplam_max":    round(max(xt_vals), 4) if xt_vals else 0,
        "action_value_ort": round(_stat.mean(av_vals), 4) if av_vals else 0,
    }
    return {"ozet": summary, "maclar": data}


@router.get("/{player_id}/external-stats", summary="FBref sezonluk istatistikler")
def get_player_external_stats(
    player_id: int,
    sezon: Optional[str] = Query(None),
    engine: Engine = Depends(get_engine),
):
    fetch_player_base(player_id, engine)
    params: dict = {"id": player_id}
    cond = "WHERE oyuncu_id = :id"
    if sezon:
        cond += " AND sezon = :sezon"
        params["sezon"] = sezon
    with engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM player_external_stats {cond} ORDER BY sezon DESC, lig"), params).mappings().fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# AI İçgörüsü
# ---------------------------------------------------------------------------

@router.get(
    "/{player_id}/insight",
    response_model=InsightResponse,
    summary="Anthropic API ile Türkçe oyuncu içgörüsü",
)
def get_player_insight(
    player_id: int,
    min_minutes: int = Query(default=90, ge=1),
    engine: Engine = Depends(get_engine),
):
    if not _insights_available:
        raise HTTPException(status_code=503, detail="AI içgörüsü bu sunucuda aktif değil.")
    try:
        result = generate_insight_for_player(player_id, engine, min_minutes=min_minutes)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return InsightResponse(**result)


# ---------------------------------------------------------------------------
# Gol zamanlama analizi
# ---------------------------------------------------------------------------

@router.get("/{player_id}/goal-timing", summary="Oyuncunun gol dakika analizi")
def get_goal_timing(
    player_id: int,
    turnuva: Optional[str] = Query(None),
    engine: Engine = Depends(get_engine),
):
    import json as _j
    import re as _re
    import datetime as _dt2

    with engine.connect() as conn:
        player_row = conn.execute(
            text("SELECT isim FROM players WHERE id = :id"), {"id": player_id}
        ).fetchone()
        if not player_row:
            raise HTTPException(status_code=404, detail="Oyuncu bulunamadı")
        player_name = player_row[0]

        shot_q = """
            SELECT s.dakika, s.period, m.turnuva, NULL::text AS rakip, m.tarih::text AS mac_tarihi
            FROM shots s
            JOIN matches m ON m.id = s.mac_id
            WHERE s.oyuncu_id = :pid AND s.gol_mu = TRUE AND s.dakika IS NOT NULL
        """
        params: dict = {"pid": player_id}
        if turnuva:
            shot_q += " AND m.turnuva ILIKE :t"
            params["t"] = f"%{turnuva}%"
        shot_goals = conn.execute(text(shot_q), params).fetchall()

        hist_rows = conn.execute(text("""
            SELECT m.tarih::text, m.takim1, m.takim2, m.goller1, m.goller2, m.turnuva_kategori
            FROM wc_historical_matches m
            WHERE m.goller1 IS NOT NULL OR m.goller2 IS NOT NULL
        """)).fetchall()

    def norm(n):
        n = (n or "").lower().strip()
        for k, v in {"á":"a","é":"e","í":"i","ó":"o","ú":"u","ü":"u","ñ":"n","ç":"c"}.items():
            n = n.replace(k, v)
        return _re.sub(r"\s+", " ", n)

    player_norm = norm(player_name)
    player_tokens = set(player_norm.split())

    def name_matches(gol_isim: str) -> bool:
        g = norm(gol_isim)
        g_tok = set(g.split())
        if not g_tok or not player_tokens:
            return False
        score = len(g_tok & player_tokens) / len(g_tok | player_tokens)
        return score >= 0.5

    goller: list[dict] = []
    for row in shot_goals:
        goller.append({"dakika": row[0], "period": row[1] or 1, "turnuva": row[2] or "",
                       "rakip": row[3] or "", "mac_tarihi": row[4] or "", "kaynak": "statsbomb"})

    sb_turnuvalar = {g["turnuva"] for g in goller}
    for row in hist_rows:
        tarih, takim1, takim2, goller1_json, goller2_json, tur_kat = row
        for (gj, rakip) in [(goller1_json, takim2), (goller2_json, takim1)]:
            if not gj:
                continue
            try:
                glist = _j.loads(gj)
            except Exception:
                continue
            for g in glist:
                if not name_matches(g.get("name", "")):
                    continue
                dak = g.get("minute")
                if dak is None:
                    continue
                goller.append({
                    "dakika": int(dak), "period": 2 if int(dak) > 45 else 1,
                    "turnuva": tur_kat or "", "rakip": rakip or "",
                    "mac_tarihi": str(tarih) if tarih else "", "kaynak": "openfootball",
                })

    if turnuva:
        goller = [g for g in goller if turnuva.lower() in g["turnuva"].lower()]

    goller.sort(key=lambda x: x["dakika"])
    araliklar = [("0–15",0,15),("16–30",16,30),("31–45",31,45),("46–60",46,60),("61–75",61,75),("76–90",76,90),("90+",91,999)]
    toplam = len(goller)
    dagilim = [{"aralik": lbl, "sayi": s, "yuzde": round(s/toplam*100,1) if toplam else 0}
               for lbl, lo, hi in araliklar
               for s in [sum(1 for g in goller if lo <= g["dakika"] <= hi)]]
    ort = round(sum(g["dakika"] for g in goller) / toplam, 1) if toplam else 0
    erken = sum(1 for g in goller if g["dakika"] <= 45)
    gec   = toplam - erken
    return {
        "oyuncu_id": player_id, "oyuncu_isim": player_name,
        "toplam_gol": toplam, "ort_dakika": ort, "goller": goller, "dagilim": dagilim,
        "erken_gec_oran": {
            "erken_pct": round(erken/toplam*100,1) if toplam else 0,
            "gec_pct":   round(gec/toplam*100,1)   if toplam else 0,
        },
    }
