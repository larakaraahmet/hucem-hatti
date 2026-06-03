"""
sources/footballdata_org.py — football-data.org API veri kaynağı
================================================================

football-data.org ücretsiz API'sinden maç fikstürleri ve sonuçları çeker.

Özellikler:
  - Büyük 5 Avrupa ligi + Şampiyonlar Ligi + UEFA Avrupa Ligi
  - Güncel sezon fikstürleri ve geçmiş sonuçlar
  - Ücretsiz plan: 10 istek/dakika, 12 turnuva

API dökümanı: https://www.football-data.org/documentation/quickstart
Kayıt: https://www.football-data.org/client/register

Gereken .env değişkeni:
    FOOTBALL_DATA_API_KEY=your_key_here

Kullanım:
    from sources.footballdata_org import FootballDataOrgSource
    src = FootballDataOrgSource()
    result = src.fetch("EPL", "2024")
"""

from __future__ import annotations

import logging
import os
import time
from datetime import date
from typing import Optional

import requests
from dotenv import load_dotenv

from .base import BaseSource
from .schema import IngestionResult, MatchRecord

load_dotenv()
log = logging.getLogger(__name__)

_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY", "")
_BASE_URL = "https://api.football-data.org/v4"
_HEADERS  = {"X-Auth-Token": _API_KEY}

# Standart lig kodu → football-data.org competition code eşlemesi
_LIG_MAP: dict[str, str] = {
    "EPL":         "PL",    # Premier League
    "LaLiga":      "PD",    # Primera Division
    "Bundesliga":  "BL1",   # 1. Bundesliga
    "SerieA":      "SA",    # Serie A
    "Ligue1":      "FL1",   # Ligue 1
    "UCL":         "CL",    # UEFA Champions League
    "UEL":         "EL",    # UEFA Europa League
    "UECL":        "UECL",  # UEFA Conference League
    "Euro":        "EC",    # UEFA European Championship
    "WC":          "WC",    # FIFA World Cup
}

# Turnuva görünen adları
_TURNUVA_ISIMLERI: dict[str, str] = {
    "EPL":        "Premier League",
    "LaLiga":     "La Liga",
    "Bundesliga": "Bundesliga",
    "SerieA":     "Serie A",
    "Ligue1":     "Ligue 1",
    "UCL":        "UEFA Champions League",
    "UEL":        "UEFA Europa League",
    "UECL":       "UEFA Conference League",
    "Euro":       "UEFA European Championship",
    "WC":         "FIFA World Cup",
}

_SEZONLAR = ["2020", "2021", "2022", "2023", "2024"]

# API rate limit: ücretsiz planda 10 istek/dk → istekler arası 6 saniye bekle
_RATE_DELAY = 6.5


class FootballDataOrgSource(BaseSource):
    """
    football-data.org REST API'sinden maç sonuçları.

    Sadece matches döner (player_stats ve shots boş).
    API anahtarı olmadan çalışmaz — .env dosyasına FOOTBALL_DATA_API_KEY ekle.
    """

    name = "footballdata_org"

    def __init__(self, dry_run: bool = False, cache: bool = True):
        super().__init__(dry_run=dry_run, cache=cache)
        self._api_key = os.getenv("FOOTBALL_DATA_API_KEY", "")

    def available_leagues(self) -> list[str]:
        return list(_LIG_MAP.keys())

    def available_seasons(self, league: str) -> list[str]:
        return _SEZONLAR.copy()

    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        football-data.org'dan bir lig + sezon için maç sonuçlarını çeker.

        Args:
            league: "EPL" | "LaLiga" | "Bundesliga" | "SerieA" | "Ligue1" |
                    "UCL" | "UEL" | "Euro" | "WC"
            season: Başlangıç yılı str ("2024" = 2024/25 sezonu)
        """
        result = IngestionResult(source=self.name, lig=league, sezon=season)

        if not self._api_key:
            result.errors.append(
                "FOOTBALL_DATA_API_KEY .env dosyasında tanımlı değil. "
                "https://www.football-data.org/client/register adresinden ücretsiz key al."
            )
            return result

        if league not in _LIG_MAP:
            result.errors.append(f"Desteklenmeyen lig: {league}. Geçerli: {list(_LIG_MAP)}")
            return result

        comp_code = _LIG_MAP[league]
        turnuva   = f"{_TURNUVA_ISIMLERI.get(league, league)} {season}"

        # TODO: Implement actual API call
        # Endpoint: GET /v4/competitions/{code}/matches?season={year}
        # Dönen JSON: {"matches": [...], "competition": {...}}
        #
        # Örnek çağrı (şu an placeholder):
        #   url = f"{_BASE_URL}/competitions/{comp_code}/matches"
        #   params = {"season": season}
        #   resp = requests.get(url, headers=_HEADERS, params=params, timeout=15)
        #   resp.raise_for_status()
        #   data = resp.json()
        #   for mac in data.get("matches", []):
        #       record = _mac_to_record(mac, league, season, turnuva, self.name)
        #       if record:
        #           result.matches.append(record)
        #   time.sleep(_RATE_DELAY)

        # Gerçek implementasyon bir sonraki adımda yapılacak.
        result.errors.append("TODO: footballdata_org fetch() henüz implemente edilmedi.")
        return result


# ── API JSON → MatchRecord ────────────────────────────────────────────────────

def _mac_to_record(mac: dict, lig: str, sezon: str, turnuva: str, source: str) -> Optional[MatchRecord]:
    """
    football-data.org maç JSON nesnesini MatchRecord'a dönüştür.

    Örnek giriş:
    {
        "id": 435882,
        "utcDate": "2024-08-16T19:00:00Z",
        "homeTeam": {"name": "Arsenal FC", "shortName": "Arsenal"},
        "awayTeam": {"name": "Wolverhampton Wanderers FC"},
        "score": {
            "winner": "HOME_TEAM",
            "fullTime": {"home": 2, "away": 0},
            "halfTime": {"home": 1, "away": 0}
        }
    }
    """
    try:
        tarih_str = mac.get("utcDate", "")
        if not tarih_str:
            return None
        tarih = date.fromisoformat(tarih_str[:10])

        ev  = str(mac.get("homeTeam", {}).get("shortName") or mac.get("homeTeam", {}).get("name", ""))
        dep = str(mac.get("awayTeam", {}).get("shortName") or mac.get("awayTeam", {}).get("name", ""))
        if not ev or not dep:
            return None

        skor = mac.get("score", {})
        ft   = skor.get("fullTime", {})
        ht   = skor.get("halfTime", {})

        return MatchRecord(
            source         = source,
            lig            = lig,
            sezon          = sezon,
            tarih          = tarih,
            ev_takim       = ev,
            dep_takim      = dep,
            turnuva        = turnuva,
            ev_gol         = ft.get("home"),
            dep_gol        = ft.get("away"),
            ht_ev_gol      = ht.get("home"),
            ht_dep_gol     = ht.get("away"),
            kaynak_mac_id  = f"fd_org_{mac.get('id', '')}",
        )
    except Exception as exc:
        log.debug("footballdata_org maç dönüşüm hatası: %s", exc)
        return None
