"""
Futbol analiz platformu — FastAPI uygulaması.
Oyuncu profili, benzerlik, şut haritası ve radar verisi endpoint'leri.
"""

import json as _json
import os
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import Engine, create_engine, text

from metrics import get_player_metrics
from similarity import find_similar_players
try:
    from insights import generate_insight_for_player
    _insights_available = True
except ImportError:
    _insights_available = False
from ingest_openfootball import h2h_compute

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://lara@localhost:5432/football"
)

# ---------------------------------------------------------------------------
# Uygulama yaşam döngüsü — engine bir kez oluşturulur, kapanışta temizlenir
# ---------------------------------------------------------------------------

_engine: Engine | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _engine
    _engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
    yield
    if _engine:
        _engine.dispose()


app = FastAPI(
    title="Futbol Analiz API",
    description="2026 Dünya Kupası oyuncu analiz platformu",
    version="0.1.0",
    lifespan=lifespan,
)

_CORS_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
]
# FRONTEND_URL env var'ı varsa ekle (Vercel deploy URL'i buraya gelir)
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _CORS_ORIGINS.append(_frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",   # tüm Vercel preview URL'leri
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("Veritabanı bağlantısı başlatılmadı.")
    return _engine


# ---------------------------------------------------------------------------
# Pydantic şemaları
# ---------------------------------------------------------------------------

class Per90Metrics(BaseModel):
    xg90:        float = Field(description="90 dakika başına beklenen gol")
    xa90:        float = Field(description="90 dakika başına beklenen asist")
    gol90:       float = Field(description="90 dakika başına gol")
    asist90:     float = Field(description="90 dakika başına asist")
    sut90:       float = Field(description="90 dakika başına şut")
    isabetli90:  float = Field(description="90 dakika başına isabetli şut")
    prog_pass90: float = Field(description="90 dakika başına ilerletici pas")


class PercentileMetrics(BaseModel):
    xg90:        float = Field(ge=0, le=100, description="xG/90 yüzdelik dilimi")
    xa90:        float = Field(ge=0, le=100)
    gol90:       float = Field(ge=0, le=100)
    asist90:     float = Field(ge=0, le=100)
    sut90:       float = Field(ge=0, le=100)
    isabetli90:  float = Field(ge=0, le=100)
    prog_pass90: float = Field(ge=0, le=100)


class PlayerProfileResponse(BaseModel):
    oyuncu_id:     int
    isim:          str
    mevki:         Optional[str]
    milliyet:      Optional[str]
    dogum_tarihi:  Optional[str]
    mac_sayisi:    int
    toplam_dakika: int
    per90:         Per90Metrics
    club_takim:    Optional[str] = None
    club_lig:      Optional[str] = None


class SimilarPlayerResponse(BaseModel):
    oyuncu_id: int
    isim:      str
    mevki:     Optional[str]
    benzerlik: float = Field(ge=0, le=100, description="Cosine similarity yüzdesi")
    per90:     Per90Metrics


class ShotResponse(BaseModel):
    id:      int
    x_konum: float = Field(description="Saha koordinatı, 0–120")
    y_konum: float = Field(description="Saha koordinatı, 0–80")
    xg:      Optional[float]
    gol_mu:  bool


class PercentilesResponse(BaseModel):
    oyuncu_id:     int
    isim:          str
    mevki:         Optional[str]
    mac_sayisi:    int
    toplam_dakika: int
    per90:         Per90Metrics
    percentile:    PercentileMetrics


class InsightResponse(BaseModel):
    oyuncu_id: int
    isim:      str
    insight:   str
    usage:     dict


class PlayerMatchRecord(BaseModel):
    mac_id:           int
    tarih:            str
    turnuva:          str
    ev_takim:         str
    deplasman_takim:  str
    dakika:           Optional[int]
    gol:              int
    asist:            int
    sut:              int
    isabetli_sut:     int
    xg:               Optional[float]
    xa:               Optional[float]
    progressive_pass: Optional[int]


class CompetitionStatsRecord(BaseModel):
    turnuva:    str
    mac_sayisi: int
    dakika:     int
    gol:        int
    asist:      int
    xg:         float
    xa:         float
    sut:        int
    isabetli_sut: int


class TeamSummary(BaseModel):
    ulke:          str
    oyuncu_sayisi: int


class PlayerSummary(BaseModel):
    oyuncu_id: int
    isim:      str
    mevki:     Optional[str]
    milliyet:  Optional[str]


# ---------------------------------------------------------------------------
# DB yardımcıları
# ---------------------------------------------------------------------------

_SQL_PLAYER_BASE = """
SELECT id, isim, mevki, dogum_tarihi::text, milliyet
FROM players
WHERE id = :player_id
"""

_SQL_CLUB_TEAM = """
SELECT t.isim AS takim, m.turnuva AS lig, COUNT(*) AS cnt
FROM player_match_stats pms
JOIN matches m ON m.id = pms.mac_id
JOIN teams t ON (t.id = m.ev_takim_id OR t.id = m.deplasman_takim_id)
WHERE pms.oyuncu_id = :player_id
  AND m.turnuva NOT ILIKE '%World Cup%'
  AND m.turnuva NOT ILIKE '%Euro%'
  AND m.turnuva NOT ILIKE '%Copa América%'
  AND m.turnuva NOT ILIKE '%African%'
  AND m.turnuva NOT ILIKE '%Nations League%'
GROUP BY t.isim, m.turnuva
ORDER BY cnt DESC
LIMIT 1
"""

_SQL_SHOTS = """
SELECT s.id, s.x_konum, s.y_konum, s.xg, s.gol_mu
FROM shots s
JOIN matches m ON m.id = s.mac_id
WHERE s.oyuncu_id = :player_id
  AND (:turnuva IS NULL OR m.turnuva = :turnuva)
ORDER BY s.id
"""


def _fetch_player_base(player_id: int, engine: Engine) -> dict:
    """players tablosundan temel bilgileri çeker; bulunamazsa 404 fırlatır."""
    with engine.connect() as conn:
        row = conn.execute(text(_SQL_PLAYER_BASE), {"player_id": player_id}).mappings().fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Oyuncu {player_id} bulunamadı.")
    return dict(row)


def _metrics_or_404(player_id: int, engine: Engine) -> dict:
    """get_player_metrics çağırır; ValueError → 404'e dönüştürür."""
    try:
        return get_player_metrics(player_id, engine)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Endpoint'ler
# ---------------------------------------------------------------------------

@app.get(
    "/player/{player_id}",
    response_model=PlayerProfileResponse,
    summary="Oyuncu profili ve 90 dakika başına metrikleri",
)
def get_player_profile(player_id: int, engine: Engine = Depends(get_engine)):
    base    = _fetch_player_base(player_id, engine)
    metrics = _metrics_or_404(player_id, engine)

    # Kulüp takımı ve ligi bul
    club_takim = club_lig = None
    with engine.connect() as conn:
        club_row = conn.execute(text(_SQL_CLUB_TEAM), {"player_id": player_id}).mappings().fetchone()
    if club_row:
        club_takim = club_row["takim"]
        # Turnuva adından yıl kısmını at  (ör. "Ligue 1 2022/23" → "Ligue 1")
        club_lig = " ".join(club_row["lig"].split()[:2]) if club_row["lig"] else None

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
    )


@app.get(
    "/player/{player_id}/similar",
    response_model=list[SimilarPlayerResponse],
    summary="Metrik vektörüne göre en benzer oyuncular",
)
def get_similar_players(
    player_id: int,
    top_n: int = Query(default=5, ge=1, le=20, description="Kaç sonuç döneceği"),
    same_position_only: bool = Query(default=False, description="Sadece aynı mevki"),
    min_minutes: int = Query(default=90, ge=1,  description="Minimum oynanan dakika"),
    engine: Engine = Depends(get_engine),
):
    try:
        results = find_similar_players(
            player_id,
            engine,
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


@app.get(
    "/player/{player_id}/shots",
    response_model=list[ShotResponse],
    summary="Şut haritası verisi (x/y koordinat, xG, gol mu?)",
)
def get_player_shots(
    player_id: int,
    turnuva: Optional[str] = Query(None, description="Turnuva filtresi"),
    engine: Engine = Depends(get_engine),
):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text(_SQL_SHOTS), {"player_id": player_id, "turnuva": turnuva}).mappings().fetchall()
    return [ShotResponse(**dict(row)) for row in rows]


@app.get(
    "/player/{player_id}/percentiles",
    response_model=PercentilesResponse,
    summary="Radar/pizza grafik için yüzdelik dilimler",
)
def get_player_percentiles(
    player_id: int,
    min_minutes: int = Query(default=90, ge=1, description="Karşılaştırma havuzunun minimum dakikası"),
    engine: Engine = Depends(get_engine),
):
    metrics = _metrics_or_404(player_id, engine)

    return PercentilesResponse(
        oyuncu_id     = player_id,
        isim          = metrics["isim"],
        mevki         = metrics["mevki"],
        mac_sayisi    = metrics["mac_sayisi"],
        toplam_dakika = metrics["toplam_dakika"],
        per90         = Per90Metrics(**metrics["per90"]),
        percentile    = PercentileMetrics(**metrics["percentile"]),
    )


_photo_cache: dict[int, str | None] = {}


def _find_photo(name: str) -> str | None:
    """Wikipedia → TheSportsDB sırasıyla dener, URL veya None döner."""
    # 1. Wikipedia
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
    # 2. TheSportsDB
    try:
        req = urllib.request.Request(
            f"https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p={urllib.parse.quote(name)}",
            headers={"User-Agent": "HuCemHatti/1.0"},
        )
        with urllib.request.urlopen(req, timeout=4) as r:
            data = _json.loads(r.read())
            pl = (data.get("players") or [])
            if pl:
                return pl[0].get("strThumb") or pl[0].get("strCutout") or None
    except Exception:
        pass
    return None


@app.get("/player/{player_id}/photo", summary="Oyuncu fotoğrafı URL'si")
def get_player_photo(player_id: int, engine: Engine = Depends(get_engine)):
    if player_id in _photo_cache:
        return {"url": _photo_cache[player_id]}
    base  = _fetch_player_base(player_id, engine)
    name  = base["isim"]
    parts = name.strip().split()
    short = f"{parts[0]} {parts[-1]}" if len(parts) >= 2 else name
    url   = _find_photo(short) or _find_photo(name)
    _photo_cache[player_id] = url
    return {"url": url}


@app.get(
    "/player/{player_id}/matches",
    response_model=list[PlayerMatchRecord],
    summary="Oyuncunun analiz edilen maçlarının listesi",
)
def get_player_matches(
    player_id: int,
    turnuva: Optional[str] = Query(None, description="Turnuva filtresi (boş = tümü)"),
    engine: Engine = Depends(get_engine),
):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                m.id              AS mac_id,
                m.tarih::text     AS tarih,
                m.turnuva,
                t1.isim           AS ev_takim,
                t2.isim           AS deplasman_takim,
                pms.dakika,
                COALESCE(pms.gol,         0) AS gol,
                COALESCE(pms.asist,       0) AS asist,
                COALESCE(pms.sut,         0) AS sut,
                COALESCE(pms.isabetli_sut,    0) AS isabetli_sut,
                pms.xg,
                pms.xa,
                COALESCE(pms.progressive_pass, 0) AS progressive_pass
            FROM player_match_stats pms
            JOIN matches m  ON m.id  = pms.mac_id
            JOIN teams   t1 ON t1.id = m.ev_takim_id
            JOIN teams   t2 ON t2.id = m.deplasman_takim_id
            WHERE pms.oyuncu_id = :player_id
              AND (:turnuva IS NULL OR m.turnuva = :turnuva)
            ORDER BY m.tarih DESC
        """), {"player_id": player_id, "turnuva": turnuva}).mappings().fetchall()
    return [PlayerMatchRecord(**dict(r)) for r in rows]


@app.get(
    "/player/{player_id}/competitions",
    summary="Oyuncunun oynandığı turnuva listesi",
)
def get_player_competitions(player_id: int, engine: Engine = Depends(get_engine)):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                m.turnuva,
                COUNT(*)                            AS mac_sayisi,
                SUM(COALESCE(pms.dakika,  0))       AS dakika,
                SUM(COALESCE(pms.gol,     0))       AS gol,
                SUM(COALESCE(pms.asist,   0))       AS asist
            FROM player_match_stats pms
            JOIN matches m ON m.id = pms.mac_id
            WHERE pms.oyuncu_id = :player_id
            GROUP BY m.turnuva
            ORDER BY MIN(m.tarih) DESC
        """), {"player_id": player_id}).mappings().fetchall()
    return [dict(r) for r in rows]


@app.get(
    "/player/{player_id}/competition-stats",
    response_model=list[CompetitionStatsRecord],
    summary="Oyuncunun turnuva bazında özet istatistikleri",
)
def get_competition_stats(player_id: int, engine: Engine = Depends(get_engine)):
    _fetch_player_base(player_id, engine)
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


@app.get(
    "/teams",
    response_model=list[TeamSummary],
    summary="Tüm ülkeleri oyuncu sayısıyla listeler",
)
def get_teams(engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT milliyet AS ulke, COUNT(*) AS oyuncu_sayisi
            FROM players
            WHERE milliyet IS NOT NULL AND milliyet != ''
            GROUP BY milliyet
            ORDER BY milliyet
        """)).mappings().fetchall()
    return [TeamSummary(**dict(r)) for r in rows]


@app.get(
    "/teams/{ulke}/players",
    response_model=list[PlayerSummary],
    summary="Bir ülkenin oyuncularını listeler",
)
def get_team_players(ulke: str, engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id AS oyuncu_id, isim, mevki, milliyet
            FROM players
            WHERE milliyet = :ulke
            ORDER BY isim
        """), {"ulke": ulke}).mappings().fetchall()
    return [PlayerSummary(**dict(r)) for r in rows]


@app.get(
    "/players/search",
    response_model=list[PlayerSummary],
    summary="Oyuncu adıyla arama (min 2 karakter)",
)
def search_players(
    q: str = Query(min_length=2, description="Aranacak oyuncu adı"),
    engine: Engine = Depends(get_engine),
):
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT id AS oyuncu_id, isim, mevki, milliyet
            FROM players
            WHERE unaccent(isim) ILIKE unaccent(:q)
            ORDER BY isim
            LIMIT 20
        """), {"q": f"%{q}%"}).mappings().fetchall()
    return [PlayerSummary(**dict(r)) for r in rows]


@app.get(
    "/stats/leaders",
    summary="Platform lider tablosu — ticker için",
)
def get_stats_leaders(engine: Engine = Depends(get_engine)):
    """Çeşitli metriklerde lider oyuncuları döner (WC2026 ticker'ı için)."""
    _SQL = """
    WITH totals AS (
        SELECT
            p.id,
            p.isim,
            p.milliyet,
            SUM(pms.gol)              AS toplam_gol,
            SUM(pms.asist)            AS toplam_asist,
            SUM(pms.xg)               AS toplam_xg,
            SUM(pms.sut)              AS toplam_sut,
            SUM(pms.dakika)           AS toplam_dk,
            COUNT(DISTINCT pms.mac_id) AS mac_sayisi
        FROM player_match_stats pms
        JOIN players p ON p.id = pms.oyuncu_id
        WHERE pms.dakika >= 90
        GROUP BY p.id, p.isim, p.milliyet
        HAVING SUM(pms.dakika) >= 270
    )
    SELECT * FROM totals ORDER BY toplam_gol DESC LIMIT 50
    """
    flags_map = {
        "France":"🇫🇷","Argentina":"🇦🇷","Portugal":"🇵🇹","Spain":"🇪🇸",
        "England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Germany":"🇩🇪","Brazil":"🇧🇷","Netherlands":"🇳🇱",
        "Croatia":"🇭🇷","Morocco":"🇲🇦","Belgium":"🇧🇪","Denmark":"🇩🇰",
        "Mexico":"🇲🇽","Uruguay":"🇺🇾","Turkey":"🇹🇷","Japan":"🇯🇵",
        "United States":"🇺🇸","Colombia":"🇨🇴","Italy":"🇮🇹","Poland":"🇵🇱",
        "Serbia":"🇷🇸","Switzerland":"🇨🇭","Ecuador":"🇪🇨","Canada":"🇨🇦",
    }
    with engine.connect() as conn:
        rows = [dict(r._mapping) for r in conn.execute(text(_SQL))]

    if not rows: return []

    def flag(nat): return flags_map.get(nat, "🏳️")
    def short(name):
        parts = name.split()
        if len(parts) >= 3: return parts[-2]
        if len(parts) == 2: return parts[-1]
        return name

    # Per-90 liderlerini ayrıca çek (min 450 dk)
    per90_rows = [r for r in rows if (r["toplam_dk"] or 0) >= 450]

    best_gol   = max(rows, key=lambda r: r["toplam_gol"]   or 0)
    best_asist = max(rows, key=lambda r: r["toplam_asist"] or 0)
    best_xg    = max(rows, key=lambda r: float(r["toplam_xg"] or 0))
    best_mac   = max(rows, key=lambda r: r["mac_sayisi"]   or 0)
    best_g90   = max(per90_rows, key=lambda r: (r["toplam_gol"] or 0) / (r["toplam_dk"] / 90)) if per90_rows else best_gol
    best_xg90  = max(per90_rows, key=lambda r: float(r["toplam_xg"] or 0) / (r["toplam_dk"] / 90)) if per90_rows else best_xg
    best_sut   = max(rows, key=lambda r: r["toplam_sut"] or 0)

    entries = [
        {"icon":"⚽", "label":"En Fazla Gol",      "value":f'{int(best_gol["toplam_gol"])} gol',      "player":short(best_gol["isim"]),   "flag":flag(best_gol["milliyet"])},
        {"icon":"🅰️", "label":"En Fazla Asist",    "value":f'{int(best_asist["toplam_asist"])} asist', "player":short(best_asist["isim"]), "flag":flag(best_asist["milliyet"])},
        {"icon":"📐", "label":"En Yüksek Toplam xG","value":f'{float(best_xg["toplam_xg"]):.1f} xG',   "player":short(best_xg["isim"]),    "flag":flag(best_xg["milliyet"])},
        {"icon":"🎯", "label":"En Fazla Şut",       "value":f'{int(best_sut["toplam_sut"])} şut',      "player":short(best_sut["isim"]),   "flag":flag(best_sut["milliyet"])},
        {"icon":"📋", "label":"En Çok Maç",         "value":f'{int(best_mac["mac_sayisi"])} maç',      "player":short(best_mac["isim"]),   "flag":flag(best_mac["milliyet"])},
        {"icon":"🏃", "label":"Gol/90 Lideri",      "value":f'{(best_g90["toplam_gol"] or 0) / (best_g90["toplam_dk"]/90):.2f} /90', "player":short(best_g90["isim"]), "flag":flag(best_g90["milliyet"])},
        {"icon":"📈", "label":"xG/90 Lideri",       "value":f'{float(best_xg90["toplam_xg"] or 0) / (best_xg90["toplam_dk"]/90):.2f} xG/90', "player":short(best_xg90["isim"]), "flag":flag(best_xg90["milliyet"])},
        {"icon":"🏆", "label":"Platform Oyuncu Sayısı", "value":"2.202 oyuncu",                        "player":"WC2026 kadrosu",          "flag":"🌍"},
    ]
    return entries


@app.get(
    "/stats/top",
    summary="Belirli bir metrikte en iyi oyuncular",
)
def get_stats_top(
    metric: str = Query(description="gol|asist|xg|sut|isabetli|gol90|xg90|asist90"),
    limit: int = Query(default=15, ge=1, le=50),
    engine: Engine = Depends(get_engine),
):
    """Seçilen metriğe göre sıralı oyuncu listesi döner (Leaders sayfası için)."""
    METRIC_EXPRS = {
        "gol":       "SUM(pms.gol)",
        "asist":     "SUM(pms.asist)",
        "xg":        "CAST(SUM(pms.xg) AS float)",
        "sut":       "SUM(pms.sut)",
        "isabetli":  "SUM(pms.isabetli_sut)",
        "gol90":     "SUM(pms.gol)::float / NULLIF(SUM(pms.dakika), 0) * 90",
        "xg90":      "CAST(SUM(pms.xg) AS float) / NULLIF(SUM(pms.dakika), 0) * 90",
        "asist90":   "SUM(pms.asist)::float / NULLIF(SUM(pms.dakika), 0) * 90",
    }
    if metric not in METRIC_EXPRS:
        raise HTTPException(status_code=400, detail=f"Geçersiz metrik: {metric}. Geçerli: {list(METRIC_EXPRS)}")

    expr = METRIC_EXPRS[metric]
    # Per-90 metrikleri için minimum dakika filtresi
    having_clause = "HAVING SUM(pms.dakika) >= 270" if metric.endswith("90") else ""

    sql = f"""
    SELECT
        p.id        AS oyuncu_id,
        p.isim,
        p.milliyet,
        p.mevki,
        {expr}                         AS deger,
        SUM(pms.dakika)                AS toplam_dk,
        COUNT(DISTINCT pms.mac_id)     AS mac_sayisi
    FROM player_match_stats pms
    JOIN players p ON p.id = pms.oyuncu_id
    WHERE pms.dakika >= 1
    GROUP BY p.id, p.isim, p.milliyet, p.mevki
    {having_clause}
    ORDER BY deger DESC NULLS LAST
    LIMIT :limit
    """
    with engine.connect() as conn:
        rows = [dict(r._mapping) for r in conn.execute(text(sql), {"limit": limit})]

    return [
        {
            "oyuncu_id": r["oyuncu_id"],
            "isim":      r["isim"],
            "milliyet":  r["milliyet"],
            "mevki":     r["mevki"],
            "deger":     float(r["deger"] or 0),
            "toplam_dk": int(r["toplam_dk"] or 0),
            "mac_sayisi": int(r["mac_sayisi"] or 0),
        }
        for r in rows
    ]


def _compute_archetype(per90: dict) -> str:
    """Per-90 metriklerine göre oyuncu arketipini hesaplar."""
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


@app.get(
    "/player/{player_id}/archetype",
    summary="Oyuncu arketipi / izci etiketi",
)
def get_player_archetype(player_id: int, engine: Engine = Depends(get_engine)):
    """Per-90 metriklerine göre oyuncu arketipini döner."""
    metrics = _metrics_or_404(player_id, engine)
    archetype = _compute_archetype(metrics["per90"])
    return {"oyuncu_id": player_id, "archetype": archetype}


# ---------------------------------------------------------------------------
# Fikstür takvimi
# ---------------------------------------------------------------------------

@app.get(
    "/fixtures",
    summary="Fikstür takvimi (TR saatiyle)",
)
def get_fixtures(
    turnuva:   Optional[str] = Query(None, description="Turnuva filtresi (ör. 'FIFA Dünya Kupası 2026')"),
    tur:       Optional[str] = Query(None, description="Aşama filtresi (ör. 'Grup', 'Final')"),
    grup:      Optional[str] = Query(None, description="Grup filtresi (A-L)"),
    durum:     Optional[str] = Query(None, description="Durum filtresi (programlı|oynandı|canlı)"),
    gun:       Optional[str] = Query(None, description="Tarih filtresi YYYY-MM-DD (TR gün başı/sonu)"),
    limit:     int           = Query(default=50, ge=1, le=200),
    engine: Engine = Depends(get_engine),
):
    """
    Fikstürleri döner. tarih_tr alanı Europe/Istanbul saatidir.
    gun parametresi TR tarihe göre filtreler.
    """
    conditions = ["1=1"]
    params: dict = {"limit": limit}

    if turnuva:
        conditions.append("f.turnuva ILIKE :turnuva")
        params["turnuva"] = f"%{turnuva}%"
    if tur:
        conditions.append("f.tur = :tur")
        params["tur"] = tur
    if grup:
        conditions.append("f.grup = :grup")
        params["grup"] = grup.upper()
    if durum:
        conditions.append("f.durum = :durum")
        params["durum"] = durum
    if gun:
        # TR saatiyle gün filtresi
        conditions.append(
            "(f.tarih_utc AT TIME ZONE 'Europe/Istanbul')::date = :gun::date"
        )
        params["gun"] = gun

    where = " AND ".join(conditions)
    sql = f"""
        SELECT
            f.id,
            f.turnuva,
            f.sezon,
            f.tur,
            f.grup,
            f.hafta,
            f.ev_takim,
            f.dep_takim,
            f.tarih_utc,
            (f.tarih_utc AT TIME ZONE 'Europe/Istanbul') AS tarih_tr,
            f.stadyum_isim,
            f.stadyum_sehir,
            f.stadyum_ulke,
            f.stadyum_kapasite,
            f.durum,
            f.ev_gol,
            f.dep_gol,
            f.sonuc,
            f.muhtemel_kadro_ev,
            f.muhtemel_kadro_dep,
            f.teknik_detaylar
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
        # datetime → ISO string
        if row.get("tarih_utc"):
            row["tarih_utc"] = row["tarih_utc"].isoformat()
        if row.get("tarih_tr"):
            row["tarih_tr"] = row["tarih_tr"].strftime("%d.%m.%Y %H:%M")
        # JSONB alanları zaten parse edilmiş olabilir
        for field in ("muhtemel_kadro_ev", "muhtemel_kadro_dep", "teknik_detaylar"):
            if isinstance(row.get(field), str):
                try:
                    import json as _j
                    row[field] = _j.loads(row[field])
                except Exception:
                    pass
        result.append(row)
    return result


@app.get(
    "/fixtures/{fixture_id}",
    summary="Tek fikstür detayı",
)
def get_fixture(fixture_id: int, engine: Engine = Depends(get_engine)):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT
                f.*,
                (f.tarih_utc AT TIME ZONE 'Europe/Istanbul') AS tarih_tr
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


# ---------------------------------------------------------------------------
# Maç sonuçları ve bahis oranları
# ---------------------------------------------------------------------------

@app.get("/matches/results", summary="Lig maç sonuçları")
def get_match_results(
    turnuva: Optional[str] = Query(None),
    sezon:   Optional[str] = Query(None, description="ör. '2023-24'"),
    limit:   int           = Query(default=100, ge=1, le=500),
    engine:  Engine        = Depends(get_engine),
):
    params: dict = {"limit": limit}
    conds = ["1=1"]
    if turnuva:
        conds.append("turnuva ILIKE :turnuva"); params["turnuva"] = f"%{turnuva}%"
    if sezon:
        conds.append("sezon = :sezon"); params["sezon"] = sezon
    sql = f"""
        SELECT * FROM match_results
        WHERE {" AND ".join(conds)}
        ORDER BY mac_tarihi DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().fetchall()
    return [dict(r) for r in rows]


@app.get("/matches/odds", summary="Bahis oranları")
def get_odds(
    turnuva: Optional[str] = Query(None),
    sezon:   Optional[str] = Query(None),
    ev:      Optional[str] = Query(None, description="Ev sahibi takım adı"),
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
    sql = f"""
        SELECT * FROM betting_odds
        WHERE {" AND ".join(conds)}
        ORDER BY mac_tarihi DESC
        LIMIT :limit
    """
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Piyasa değeri & xG trendi
# ---------------------------------------------------------------------------

@app.get("/player/{player_id}/market", summary="Transfermarkt piyasa değeri")
def get_player_market(player_id: int, engine: Engine = Depends(get_engine)):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT * FROM player_market_values WHERE oyuncu_id = :id
        """), {"id": player_id}).mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Transfermarkt verisi bulunamadı.")
    d = dict(row)
    if d.get("sozlesme_bitis"):
        d["sozlesme_bitis"] = str(d["sozlesme_bitis"])
    if d.get("guncelleme"):
        d["guncelleme"] = d["guncelleme"].isoformat()
    return d


@app.get("/player/{player_id}/xg-trend", summary="Understat xG/xA sezon trendi")
def get_player_xg_trend(player_id: int, engine: Engine = Depends(get_engine)):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT sezon, lig, mac_sayisi, dakika, gol, xg, asist, xa,
                   xg_zincir, xg_yaratma
            FROM player_xg_trends
            WHERE oyuncu_id = :id
            ORDER BY sezon, lig
        """), {"id": player_id}).mappings().fetchall()
    return [dict(r) for r in rows]


@app.get("/player/{player_id}/advanced-value", summary="xT / action value metrikleri")
def get_player_advanced_value(
    player_id:  int,
    mac_limit:  int = Query(default=20, ge=1, le=100, description="Son N maç"),
    engine: Engine = Depends(get_engine),
):
    _fetch_player_base(player_id, engine)
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                pxt.mac_id,
                m.tarih::text AS tarih,
                m.turnuva,
                pxt.xt_toplam,
                pxt.xt_ofansif,
                pxt.xt_defansif,
                pxt.action_value,
                pxt.tasima_xt,
                pxt.pas_xt,
                pxt.sut_xt,
                pxt.dakika,
                pxt.kaynak
            FROM player_xt_stats pxt
            JOIN matches m ON m.id = pxt.mac_id
            WHERE pxt.oyuncu_id = :id
            ORDER BY m.tarih DESC
            LIMIT :lim
        """), {"id": player_id, "lim": mac_limit}).mappings().fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail="xT verisi bulunamadı.")

    data = [dict(r) for r in rows]
    # Özet istatistikler
    import statistics as _stat
    xt_vals = [float(r["xt_toplam"] or 0) for r in data]
    av_vals = [float(r["action_value"] or 0) for r in data]
    summary = {
        "mac_sayisi":      len(data),
        "xt_toplam_ort":   round(_stat.mean(xt_vals), 4) if xt_vals else 0,
        "xt_toplam_max":   round(max(xt_vals), 4) if xt_vals else 0,
        "action_value_ort": round(_stat.mean(av_vals), 4) if av_vals else 0,
    }
    return {"ozet": summary, "maclar": data}


@app.get("/player/{player_id}/external-stats", summary="FBref sezonluk istatistikler")
def get_player_external_stats(
    player_id: int,
    sezon:     Optional[str] = Query(None, description="Sezon filtresi (ör. '2023-24')"),
    engine: Engine = Depends(get_engine),
):
    _fetch_player_base(player_id, engine)
    params: dict = {"id": player_id}
    cond = "WHERE oyuncu_id = :id"
    if sezon:
        cond += " AND sezon = :sezon"
        params["sezon"] = sezon
    with engine.connect() as conn:
        rows = conn.execute(text(f"""
            SELECT * FROM player_external_stats
            {cond}
            ORDER BY sezon DESC, lig
        """), params).mappings().fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="FBref verisi bulunamadı.")
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Oyuncu içgörüsü (Anthropic)
# ---------------------------------------------------------------------------

@app.get(
    "/player/{player_id}/insight",
    response_model=InsightResponse,
    summary="Anthropic API ile Türkçe oyuncu içgörüsü üret",
)
def get_player_insight(
    player_id:   int,
    min_minutes: int = Query(default=90, ge=1, description="Minimum oynanan dakika"),
    engine:      Engine = Depends(get_engine),
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
# H2H — İki takım arasındaki Dünya Kupası geçmişi
# ---------------------------------------------------------------------------

@app.get("/h2h", summary="İki takım arasındaki WC geçmişi (H2H)")
def head_to_head(
    takim1:     str   = Query(...,      description="1. takım (İngilizce, ör. Argentina)"),
    takim2:     str   = Query(...,      description="2. takım (İngilizce, ör. France)"),
    normalize:  bool  = Query(True,     description="West Germany → Germany gibi normalleştirme"),
    min_yil:    int   = Query(1930,     description="Başlangıç yılı"),
    max_yil:    int   = Query(2026,     description="Bitiş yılı"),
    engine:     Engine = Depends(get_engine),
):
    """
    İki millî takım arasındaki tüm Dünya Kupası maçlarını döndürür.

    - **takim1 / takim2**: İngilizce takım isimleri (ör. "Germany", "Brazil")
    - **normalize**: True ise "West Germany" → "Germany" gibi isim düzeltmesi uygulanır
    - **min_yil / max_yil**: Filtrelenecek yıl aralığı

    Yanıt şeması:
    ```
    {
      "takim1": str,
      "takim2": str,
      "toplam_mac": int,
      "takim1_galibiyet": int,
      "takim2_galibiyet": int,
      "beraberlik": int,
      "takim1_gol": int,
      "takim2_gol": int,
      "son_5": [...],
      "tum_maclar": [
        { "yil", "tarih", "tur_tr", "grup",
          "takim1", "takim2", "gol1", "gol2",
          "kazanan", "stadyum" }
      ]
    }
    ```
    """
    try:
        result = h2h_compute(
            engine, takim1, takim2,
            normalize=normalize,
            min_yil=min_yil,
            max_yil=max_yil,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"H2H hesaplama hatası: {e}")

    # date nesnelerini string'e çevir (JSON serileştirme)
    result["tum_maclar"] = [
        {k: str(v) if hasattr(v, "isoformat") else v for k, v in m.items()}
        for m in result["tum_maclar"]
    ]
    result["son_5"] = [
        {k: str(v) if hasattr(v, "isoformat") else v for k, v in m.items()}
        for m in result["son_5"]
    ]
    return result


@app.get("/player/{player_id}/goal-timing", summary="Oyuncunun gol dakika analizi")
def get_goal_timing(
    player_id: int,
    turnuva: Optional[str] = Query(None, description="Turnuva filtresi"),
    engine: Engine = Depends(get_engine),
):
    """
    Oyuncunun attığı gollerin dakika dağılımını döndürür.
    İki kaynak birleştirilir:
      1. shots tablosu (StatsBomb, dakika bilgisi olan kayıtlar)
      2. wc_historical_matches.goller1/goller2 JSON (isim eşleştirmesiyle)

    Yanıt:
      goller       : [{dakika, period, turnuva, rakip, mac_tarihi}]
      dagilim      : [{aralik, sayi, yuzde}]  — 0-15, 16-30, ... 76-90, 90+
      ort_dakika   : float
      toplam_gol   : int
      erken_gec_oran: {erken_pct, son_pct}   — 0-45 / 46-90+ karşılaştırma
    """
    with engine.connect() as conn:
        # Oyuncu ismini al (wc_historical_matches eşleştirmesi için)
        player_row = conn.execute(
            text("SELECT isim FROM players WHERE id = :id"), {"id": player_id}
        ).fetchone()
        if not player_row:
            raise HTTPException(status_code=404, detail="Oyuncu bulunamadı")
        player_name = player_row[0]

        # ── Kaynak 1: shots tablosu (StatsBomb, dakika dolu olanlar) ──────────
        shot_q = """
            SELECT s.dakika, s.period,
                   m.turnuva,
                   NULL::text AS rakip,
                   m.tarih::text AS mac_tarihi
            FROM shots s
            JOIN matches m ON m.id = s.mac_id
            WHERE s.oyuncu_id = :pid
              AND s.gol_mu    = TRUE
              AND s.dakika    IS NOT NULL
        """
        params: dict = {"pid": player_id}
        if turnuva:
            shot_q += " AND m.turnuva ILIKE :t"
            params["t"] = f"%{turnuva}%"

        shot_goals = conn.execute(text(shot_q), params).fetchall()

        # ── Kaynak 2: wc_historical_matches goller JSON ────────────────────
        # oyuncu ismine göre goller1/goller2 JSON içinde ara
        hist_q = """
            SELECT
                m.tarih::text,
                m.takim1, m.takim2,
                m.goller1, m.goller2,
                m.turnuva_kategori
            FROM wc_historical_matches m
            WHERE
                m.goller1 IS NOT NULL OR m.goller2 IS NOT NULL
        """
        hist_rows = conn.execute(text(hist_q)).fetchall()

    import json as _j, re as _re

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

    # Kaynak 1: shots
    for row in shot_goals:
        goller.append({
            "dakika":     row[0],
            "period":     row[1] or 1,
            "turnuva":    row[2] or "",
            "rakip":      row[3] or "",
            "mac_tarihi": row[4] or "",
            "kaynak":     "statsbomb",
        })

    # Kaynak 2: wc_historical_matches (sadece StatsBomb'da olmayan turnuvalar için)
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
                    "dakika":     int(dak),
                    "period":     2 if int(dak) > 45 else 1,
                    "turnuva":    tur_kat or "",
                    "rakip":      rakip or "",
                    "mac_tarihi": str(tarih) if tarih else "",
                    "kaynak":     "openfootball",
                })

    # turnuva filtresi (kaynak 2 için de)
    if turnuva:
        goller = [g for g in goller if turnuva.lower() in g["turnuva"].lower()]

    # Tekrar gidermek için (aynı dakika + rakip combo birden fazla kaynakta olabilir)
    goller.sort(key=lambda x: x["dakika"])

    # ── Dağılım (15dk aralıklar) ───────────────────────────────────────────
    araliklar = [
        ("0–15",  0,   15),
        ("16–30", 16,  30),
        ("31–45", 31,  45),
        ("46–60", 46,  60),
        ("61–75", 61,  75),
        ("76–90", 76,  90),
        ("90+",   91,  999),
    ]
    toplam = len(goller)
    dagilim = []
    for label, lo, hi in araliklar:
        sayi = sum(1 for g in goller if lo <= g["dakika"] <= hi)
        dagilim.append({
            "aralik": label,
            "sayi":   sayi,
            "yuzde":  round(sayi / toplam * 100, 1) if toplam else 0,
        })

    ort = round(sum(g["dakika"] for g in goller) / toplam, 1) if toplam else 0
    erken = sum(1 for g in goller if g["dakika"] <= 45)
    gec   = toplam - erken

    return {
        "oyuncu_id":    player_id,
        "oyuncu_isim":  player_name,
        "toplam_gol":   toplam,
        "ort_dakika":   ort,
        "goller":       goller,
        "dagilim":      dagilim,
        "erken_gec_oran": {
            "erken_pct": round(erken / toplam * 100, 1) if toplam else 0,
            "gec_pct":   round(gec   / toplam * 100, 1) if toplam else 0,
        },
    }
