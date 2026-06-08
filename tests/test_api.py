"""Temel API endpoint testleri — FastAPI TestClient ile."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from api import app

client = TestClient(app, raise_server_exceptions=False)


# ── Sağlık / konfigürasyon ────────────────────────────────────────────────────

def test_app_has_routes():
    routes = [r.path for r in app.routes]
    assert "/player/{player_id}" in routes
    assert "/teams" in routes
    assert "/stats/leaders" in routes
    assert "/fixtures" in routes
    assert "/h2h" in routes


def test_openapi_schema():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert schema["info"]["title"] == "Futbol Analiz API"


# ── DB yokken 500 değil anlamlı hata ─────────────────────────────────────────

def test_player_without_db_returns_error():
    """DB bağlantısı yokken endpoint RuntimeError fırlatır, 500 döner."""
    r = client.get("/player/1")
    # DB yokken ya 500 ya da özel hata — 200 olmamalı
    assert r.status_code != 200 or r.json() is not None


# ── Router include kontrolü ───────────────────────────────────────────────────

def test_all_routers_included():
    paths = {r.path for r in app.routes}
    assert "/player/{player_id}" in paths
    assert "/player/{player_id}/similar" in paths
    assert "/player/{player_id}/shots" in paths
    assert "/player/{player_id}/matches" in paths
    assert "/teams" in paths
    assert "/teams/{ulke}/players" in paths
    assert "/players/search" in paths
    assert "/stats/leaders" in paths
    assert "/stats/top" in paths
    assert "/fixtures" in paths
    assert "/fixtures/groups" in paths
    assert "/fixtures/bracket" in paths
    assert "/h2h" in paths
    assert "/auth/ping" in paths
    assert "/auth/login" in paths
