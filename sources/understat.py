"""
sources/understat.py — Understat veri kaynağı
==============================================

Büyük 5 Avrupa ligi için xG dahil oyuncu sezon istatistikleri ve
şut koordinatları sağlar.

Kütüphane: soccerdata.Understat (pip install soccerdata)
Koordinat dönüşümü: Understat (0–1) → StatsBomb benzeri (0–120 / 0–80)
  sb_x = us_x * 120
  sb_y = us_y * 80

Desteklenen ligler : EPL, LaLiga, Bundesliga, SerieA, Ligue1
Desteklenen sezonlar: 2020–2024 (başlangıç yılı)
Gereken .env değişkeni: yok (scraping — API anahtarı gerekmez)

Kullanım:
    from sources.understat import UnderstatSource
    src = UnderstatSource()
    result = src.fetch("EPL", "2024")
"""

from __future__ import annotations

import logging
import re
import time
import warnings
from datetime import date
from typing import Optional

from .base import BaseSource
from .schema import IngestionResult, PlayerStatRecord, ShotRecord

warnings.filterwarnings("ignore")
log = logging.getLogger(__name__)

# Understat lig kodu → soccerdata lig kodu eşlemesi
_LIG_MAP: dict[str, str] = {
    "EPL":        "ENG-Premier League",
    "LaLiga":     "ESP-La Liga",
    "Bundesliga": "GER-Bundesliga",
    "SerieA":     "ITA-Serie A",
    "Ligue1":     "FRA-Ligue 1",
}

# Desteklenen sezonlar (başlangıç yılı) — "2025" = 2025/26 sezonu
_SEZONLAR = ["2020", "2021", "2022", "2023", "2024", "2025"]


def _us_to_sb(x: float, y: float) -> tuple[float, float]:
    """Understat normalize koordinatını StatsBomb benzeri koordinata çevirir."""
    return round(x * 120, 2), round(y * 80, 2)


class UnderstatSource(BaseSource):
    """
    Understat üzerinden Big 5 ligi xG + şut verisi.

    fetch() iki şey döndürür:
      - player_stats: sezon bazlı gol/asist/xG/xA özeti
      - shots: (include_shots=True ise) maç bazlı şut koordinatları
    """

    name = "understat"

    def __init__(
        self,
        dry_run: bool = False,
        cache: bool = True,
        include_shots: bool = False,
        shots_limit_mac: Optional[int] = None,
    ):
        """
        Args:
            include_shots:   True ise şut koordinatları da çekilir (yavaş).
            shots_limit_mac: Şut için en fazla N maç işle (test için).
        """
        super().__init__(dry_run=dry_run, cache=cache)
        self.include_shots    = include_shots
        self.shots_limit_mac  = shots_limit_mac

    def available_leagues(self) -> list[str]:
        return list(_LIG_MAP.keys())

    def available_seasons(self, league: str) -> list[str]:
        return _SEZONLAR.copy()

    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        Understat'tan bir lig + sezon için oyuncu istatistiklerini çeker.

        Args:
            league: "EPL" | "LaLiga" | "Bundesliga" | "SerieA" | "Ligue1"
            season: Başlangıç yılı str ("2024" = 2024/25 sezonu)
        """
        result = IngestionResult(source=self.name, lig=league, sezon=season)

        if league not in _LIG_MAP:
            result.errors.append(f"Desteklenmeyen lig: {league}. Geçerli: {list(_LIG_MAP)}")
            return result

        try:
            import soccerdata as sd
        except ImportError:
            result.errors.append("soccerdata kütüphanesi yüklü değil: pip install soccerdata")
            return result

        sd_lig = _LIG_MAP[league]
        sd_sezon = int(season)

        # ── Sezon istatistikleri ──────────────────────────────────────────────
        try:
            us = sd.Understat(leagues=sd_lig, seasons=sd_sezon, no_cache=not self.cache)
            df = us.read_player_season_stats()
        except Exception as exc:
            result.errors.append(f"Understat season stats HATA: {exc}")
            return result

        # MultiIndex'i düzleştir: league/season/team/player → normal sütunlar
        df_flat = df.reset_index()
        for _, row in df_flat.iterrows():
            stat = _row_to_player_stat(row, league, season, self.name)
            if stat:
                result.player_stats.append(stat)

        # ── Şut koordinatları (opsiyonel, yavaş) ─────────────────────────────
        if self.include_shots:
            try:
                shots_df = us.read_shot_events()
                if self.shots_limit_mac:
                    mac_listesi = shots_df.index.get_level_values("game_id").unique()
                    shots_df = shots_df[
                        shots_df.index.get_level_values("game_id").isin(
                            mac_listesi[:self.shots_limit_mac]
                        )
                    ]

                for _, srow in shots_df.iterrows():
                    shot = _shot_row_to_record(srow, league, season, self.name)
                    if shot:
                        result.shots.append(shot)

                time.sleep(0.5)  # Understat'ı aşırı yükleme
            except Exception as exc:
                result.errors.append(f"Understat shots HATA: {exc}")

        return result


# ── Satır → kayıt dönüşümleri ─────────────────────────────────────────────────

def _row_to_player_stat(row, lig: str, sezon: str, source: str) -> Optional[PlayerStatRecord]:
    """
    soccerdata Understat satırını PlayerStatRecord'a dönüştür.

    reset_index() sonrası sütun isimleri:
      index: league, season, team, player
      veri:  matches, minutes, goals, xg, np_goals, np_xg,
             assists, xa, shots, yellow_cards, red_cards, ...
    """
    try:
        oyuncu = str(row.get("player", "")).strip()
        takim  = str(row.get("team",   "")).strip()
        if not oyuncu or not takim or oyuncu == "nan" or takim == "nan":
            return None

        def _int(v) -> Optional[int]:
            try:
                f = float(v)
                import math
                return int(f) if not math.isnan(f) else None
            except (TypeError, ValueError):
                return None

        def _float(v) -> Optional[float]:
            try:
                import math
                f = float(v)
                return round(f, 4) if not math.isnan(f) else None
            except (TypeError, ValueError):
                return None

        return PlayerStatRecord(
            source       = source,
            lig          = lig,
            sezon        = sezon,
            oyuncu_isim  = oyuncu,
            takim        = takim,
            mac_sayisi   = _int(row.get("matches")),
            dakika       = _int(row.get("minutes")),
            gol          = _int(row.get("goals")),
            asist        = _int(row.get("assists")),
            np_gol       = _int(row.get("np_goals")),
            xg           = _float(row.get("xg")),
            xa           = _float(row.get("xa")),
            npxg         = _float(row.get("np_xg")),
            sut          = _int(row.get("shots")),
            sari_kart    = _int(row.get("yellow_cards")),
            kirmizi_kart = _int(row.get("red_cards")),
        )
    except Exception as exc:
        log.debug("Understat satır dönüşüm hatası: %s", exc)
        return None


def _shot_row_to_record(row, lig: str, sezon: str, source: str) -> Optional[ShotRecord]:
    """soccerdata Understat şut satırını ShotRecord'a dönüştür."""
    try:
        x_raw = float(row.get("X", row.get("x", 0)) or 0)
        y_raw = float(row.get("Y", row.get("y", 0)) or 0)
        if x_raw == 0 and y_raw == 0:
            return None

        sb_x, sb_y = _us_to_sb(x_raw, y_raw)

        # Tarih çıkarımı
        mac_tarih = None
        for col in ("date", "match_date", "game_date"):
            if col in row.index and row[col] is not None:
                try:
                    mac_tarih = date.fromisoformat(str(row[col])[:10])
                    break
                except ValueError:
                    pass
        if not mac_tarih:
            return None

        result_str = str(row.get("result", row.get("outcome", ""))).lower()
        gol_mu = result_str in ("goal", "gol")

        return ShotRecord(
            source      = source,
            lig         = lig,
            sezon       = sezon,
            oyuncu_isim = str(row.get("player", "")),
            mac_tarih   = mac_tarih,
            ev_takim    = str(row.get("h_team", row.get("home_team", ""))),
            dep_takim   = str(row.get("a_team", row.get("away_team", ""))),
            x           = sb_x,
            y           = sb_y,
            gol_mu      = gol_mu,
            xg          = float(row.get("xG", row.get("xg", 0)) or 0) or None,
            dakika      = int(row.get("minute", 0) or 0) or None,
        )
    except Exception as exc:
        log.debug("Understat şut satır dönüşüm hatası: %s", exc)
        return None
