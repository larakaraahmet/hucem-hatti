"""
Futbol analiz platformu — FastAPI uygulaması.
Router'lar ayrı dosyalarda; bu modül sadece app konfigürasyonu ve lifespan.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import init_engine, dispose_engine
from notifications import ntfy
from routers import auth, fixtures, h2h, players, stats, teams


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_engine()
    ntfy("⚽ Hücem Hattı açıldı", "API sunucusu başlatıldı.")
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
app.include_router(auth.router)
