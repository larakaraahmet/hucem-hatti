"""Veritabanı bağlantısı ve paylaşılan SQL yardımcıları."""

import os

from fastapi import HTTPException
from sqlalchemy import Engine, create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

_engine: Engine | None = None


def init_engine() -> Engine:
    global _engine
    _engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
    return _engine


def dispose_engine() -> None:
    global _engine
    if _engine:
        _engine.dispose()
        _engine = None


def get_engine() -> Engine:
    if _engine is None:
        raise RuntimeError("Veritabanı bağlantısı başlatılmadı.")
    return _engine


# ---------------------------------------------------------------------------
# SQL sabitleri
# ---------------------------------------------------------------------------

_SQL_PLAYER_BASE = """
SELECT id, isim, mevki, dogum_tarihi::text, milliyet, current_club, current_club_ulke,
       COALESCE(has_data, true) AS has_data
FROM players
WHERE id = :player_id
"""

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

_SQL_SHOTS = """
SELECT s.id, s.x_konum, s.y_konum, s.xg, s.gol_mu
FROM shots s
JOIN matches m ON m.id = s.mac_id
WHERE s.oyuncu_id = :player_id
  AND (:turnuva IS NULL OR m.turnuva = :turnuva)
ORDER BY s.id
"""

_EMPTY_METRICS = {
    "per90":       {"xg90": 0, "xa90": 0, "gol90": 0, "asist90": 0, "sut90": 0, "isabetli90": 0, "prog_pass90": 0},
    "percentile":  {"xg90": 0, "xa90": 0, "gol90": 0, "asist90": 0, "sut90": 0, "isabetli90": 0, "prog_pass90": 0},
    "mac_sayisi":    0,
    "toplam_dakika": 0,
    "isim":          "",
    "mevki":         None,
}


def fetch_player_base(player_id: int, engine: Engine) -> dict:
    """players tablosundan temel bilgileri çeker; bulunamazsa 404 fırlatır."""
    with engine.connect() as conn:
        row = conn.execute(text(_SQL_PLAYER_BASE), {"player_id": player_id}).mappings().fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Oyuncu {player_id} bulunamadı.")
    return dict(row)


def metrics_or_empty(player_id: int, engine: Engine) -> dict:
    """get_player_metrics çağırır; veri yoksa boş metrik döner (404 değil)."""
    from metrics import get_player_metrics
    try:
        return get_player_metrics(player_id, engine)
    except ValueError:
        return _EMPTY_METRICS
