"""
sources/footballdata_couk.py — football-data.co.uk CSV veri kaynağı
====================================================================

football-data.co.uk'dan Büyük 5 lig geçmiş maç sonuçlarını (CSV) çeker.

Özellikler:
  - 30+ yıl geçmiş veri
  - Bahis oranları (B365, Bet365 vb.)
  - Yarı devre / tam devre skorları
  - H2H analizi için ideal

URL formatı:
  https://www.football-data.co.uk/mmz4281/{SSYY}/{KOD}.csv
  Örn: 2425 sezonu EPL → /mmz4281/2425/E0.csv

Gereken .env değişkeni: yok (CSV indirme, API anahtarı gerekmez)

Kullanım:
    from sources.footballdata_couk import FootballDataCoUkSource
    src = FootballDataCoUkSource()
    result = src.fetch("EPL", "2024")
"""

from __future__ import annotations

import io
import logging
import time
from datetime import date
from typing import Optional

import pandas as pd
import requests

from .base import BaseSource
from .schema import IngestionResult, MatchRecord

log = logging.getLogger(__name__)

_BASE_URL = "https://www.football-data.co.uk/mmz4281"

# Standart lig kodu → football-data.co.uk dosya kodu
_LIG_MAP: dict[str, str] = {
    "EPL":         "E0",
    "Championship":"E1",
    "LaLiga":      "SP1",
    "LaLiga2":     "SP2",
    "Bundesliga":  "D1",
    "Bundesliga2": "D2",
    "SerieA":      "I1",
    "SerieB":      "I2",
    "Ligue1":      "F1",
    "Ligue2":      "F2",
    "Eredivisie":  "N1",
    "BelgiumPD":   "B1",
    "PrimeiraLiga":"P1",
    "ScottishPL":  "SC0",
    "SuperLig":    "T1",    # Süper Lig
    "GreekSL":     "G1",
}

_TURNUVA_ISIMLERI: dict[str, str] = {
    "EPL":          "Premier League",
    "Championship": "Championship",
    "LaLiga":       "La Liga",
    "LaLiga2":      "La Liga 2",
    "Bundesliga":   "Bundesliga",
    "Bundesliga2":  "2. Bundesliga",
    "SerieA":       "Serie A",
    "SerieB":       "Serie B",
    "Ligue1":       "Ligue 1",
    "Ligue2":       "Ligue 2",
    "Eredivisie":   "Eredivisie",
    "BelgiumPD":    "Belgian Pro League",
    "PrimeiraLiga": "Primeira Liga",
    "ScottishPL":   "Scottish Premiership",
    "SuperLig":     "Süper Lig",
    "GreekSL":      "Super League Greece",
}

_SEZONLAR = [
    "2018", "2019", "2020", "2021", "2022", "2023", "2024",
]


def _sezon_kodu(sezon: str) -> str:
    """
    "2024" → "2425" (football-data.co.uk dosya adı formatı)
    """
    y = int(sezon)
    return f"{str(y)[-2:]}{str(y+1)[-2:]}"


class FootballDataCoUkSource(BaseSource):
    """
    football-data.co.uk'dan geçmiş maç sonuçları (CSV).

    Sadece matches döner (player_stats ve shots boş).
    Bahis oranları MatchRecord'a şu an eklenmemiş, ancak
    club_historical_matches tablosuna yazılabilir (ayrı writer).
    """

    name = "footballdata_couk"

    def available_leagues(self) -> list[str]:
        return list(_LIG_MAP.keys())

    def available_seasons(self, league: str) -> list[str]:
        return _SEZONLAR.copy()

    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        football-data.co.uk CSV'den bir lig + sezon için maç sonuçlarını çeker.

        Args:
            league: "EPL" | "LaLiga" | "Bundesliga" | "SerieA" | "Ligue1" |
                    "SuperLig" | "Eredivisie" | ...
            season: Başlangıç yılı str ("2024" = 2024/25 sezonu)
        """
        result = IngestionResult(source=self.name, lig=league, sezon=season)

        if league not in _LIG_MAP:
            result.errors.append(f"Desteklenmeyen lig: {league}. Geçerli: {list(_LIG_MAP)}")
            return result

        kod      = _LIG_MAP[league]
        sk       = _sezon_kodu(season)
        url      = f"{_BASE_URL}/{sk}/{kod}.csv"
        turnuva  = f"{_TURNUVA_ISIMLERI.get(league, league)} {season}/{str(int(season)+1)[-2:]}"

        try:
            resp = requests.get(url, timeout=20)
            if resp.status_code == 404:
                result.errors.append(f"CSV bulunamadı: {url}")
                return result
            resp.raise_for_status()
            df = pd.read_csv(io.StringIO(resp.text), low_memory=False)
        except requests.RequestException as exc:
            result.errors.append(f"HTTP hatası (football-data.co.uk erişilemiyor olabilir): {exc}")
            return result
        except Exception as exc:
            result.errors.append(f"CSV parse hatası: {exc}")
            return result

        for _, row in df.iterrows():
            record = _row_to_record(row, league, season, turnuva, self.name)
            if record:
                result.matches.append(record)

        time.sleep(0.5)
        return result


# ── CSV satırı → MatchRecord ──────────────────────────────────────────────────

def _row_to_record(row, lig: str, sezon: str, turnuva: str, source: str) -> Optional[MatchRecord]:
    """
    football-data.co.uk CSV satırını MatchRecord'a dönüştür.

    CSV kolon adları: Div, Date, HomeTeam, AwayTeam, FTHG, FTAG, FTR,
                      HTHG, HTAG, HTR, B365H, B365D, B365A, ...
    """
    try:
        tarih_str = str(row.get("Date", ""))
        if not tarih_str or tarih_str == "nan":
            return None

        # Birden fazla format: "16/08/2024" veya "16/08/24" veya "2024-08-16"
        tarih = None
        for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
            try:
                import datetime
                tarih = datetime.datetime.strptime(tarih_str.strip(), fmt).date()
                break
            except ValueError:
                continue
        if not tarih:
            return None

        ev  = str(row.get("HomeTeam", "")).strip()
        dep = str(row.get("AwayTeam", "")).strip()
        if not ev or not dep or ev == "nan" or dep == "nan":
            return None

        def _int(v) -> Optional[int]:
            try:
                val = float(v)
                return int(val) if not pd.isna(val) else None
            except (TypeError, ValueError):
                return None

        return MatchRecord(
            source        = source,
            lig           = lig,
            sezon         = sezon,
            tarih         = tarih,
            ev_takim      = ev,
            dep_takim     = dep,
            turnuva       = turnuva,
            ev_gol        = _int(row.get("FTHG")),
            dep_gol       = _int(row.get("FTAG")),
            ht_ev_gol     = _int(row.get("HTHG")),
            ht_dep_gol    = _int(row.get("HTAG")),
            kaynak_mac_id = f"fdcouk_{lig}_{sezon}_{tarih}_{ev[:4]}_{dep[:4]}",
        )
    except Exception as exc:
        log.debug("footballdata_couk satır dönüşüm hatası: %s", exc)
        return None
