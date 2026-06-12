"""
Futbol analiz platformu — FastAPI uygulaması.
Router'lar ayrı dosyalarda; bu modül sadece app konfigürasyonu ve lifespan.
"""

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_engine, dispose_engine, get_engine
from notifications import ntfy
from routers import auth, fixtures, group_sim, h2h, players, player_extras, simulate, stats, tactical_dna, teams

log = logging.getLogger(__name__)

SCORE_SYNC_INTERVAL = 3600  # her saat


async def _score_sync_loop():
    """Her saat football-data.org'dan WC2026 skorlarını çeker."""
    import time
    import requests
    from sqlalchemy import text

    api_key = os.getenv("FOOTBALL_DATA_API_KEY", "")
    if not api_key:
        log.warning("FOOTBALL_DATA_API_KEY yok — skor sync devre dışı")
        return

    base = "https://api.football-data.org/v4"
    headers = {"X-Auth-Token": api_key}

    while True:
        try:
            r = requests.get(f"{base}/competitions/WC/matches",
                             headers=headers, timeout=20,
                             params={"status": "FINISHED"})
            r.raise_for_status()
            matches = r.json().get("matches", [])
            engine = get_engine()
            ok = 0
            with engine.begin() as conn:
                for m in matches:
                    score = m.get("score", {}).get("fullTime", {})
                    ev_gol = score.get("home")
                    dep_gol = score.get("away")
                    if ev_gol is None or dep_gol is None:
                        continue
                    from datetime import datetime
                    tarih_utc = datetime.fromisoformat(
                        m["utcDate"].replace("Z", "+00:00"))
                    row = conn.execute(text("""
                        SELECT id FROM fixtures
                        WHERE ABS(EXTRACT(EPOCH FROM (tarih_utc - :t))) < 5400
                          AND (turnuva ILIKE '%dünya%' OR turnuva ILIKE '%world%')
                        ORDER BY ABS(EXTRACT(EPOCH FROM (tarih_utc - :t)))
                        LIMIT 1
                    """), {"t": tarih_utc}).fetchone()
                    if row:
                        conn.execute(text("""
                            UPDATE fixtures SET ev_gol=:ev, dep_gol=:dep,
                              durum='oynandı', guncelleme=NOW() WHERE id=:id
                        """), {"id": row.id, "ev": ev_gol, "dep": dep_gol})
                        ok += 1
            if ok:
                log.info(f"Skor sync: {ok} maç güncellendi")
        except Exception as e:
            log.warning(f"Skor sync hatası: {e}")

        await asyncio.sleep(SCORE_SYNC_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
    ntfy("🚀 Hücem Hattı", "API sunucusu başladı")
    asyncio.create_task(_score_sync_loop())
    yield
    dispose_engine()


app = FastAPI(
    title="Futbol Analiz API",
    description="2026 Dünya Kupası oyuncu analiz platformu",
    version="0.2.0",
    lifespan=lifespan,
)

_CORS_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
]
_frontend_url = os.getenv("FRONTEND_URL", "")
if _frontend_url:
    _CORS_ORIGINS.append(_frontend_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(players.router)
app.include_router(teams.router)
app.include_router(stats.router)
app.include_router(fixtures.router)
app.include_router(h2h.router)
app.include_router(simulate.router)
app.include_router(group_sim.router)
app.include_router(player_extras.router)
app.include_router(tactical_dna.router)
app.include_router(auth.router)
