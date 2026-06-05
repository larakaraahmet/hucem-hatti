"""
sources/statsbomb.py — StatsBomb Open Data veri kaynağı
========================================================

StatsBomb açık veri setinden turnuva bazlı maç sonuçları,
oyuncu istatistikleri ve şut koordinatları (xG, dakika, konum) çeker.

Kütüphane: statsbombpy (pip install statsbombpy)

Desteklenen turnuvalar (önce kısa kod, sonra tam isim):
    wc2022   → FIFA World Cup 2022
    wc2018   → FIFA World Cup 2018
    euro2024 → UEFA Euro 2024
    euro2020 → UEFA Euro 2020
    copa2024 → Copa América 2024
    laliga   → La Liga 2020/21
    ligue1   → Ligue 1 2022/23
    bundesliga → Bundesliga 2023/24
    ucl      → Champions League 2018/19

Gereken .env değişkeni: yok (açık veri, credential gerekmez)

Kullanım:
    from sources.statsbomb import StatsBombSource
    src = StatsBombSource()
    result = src.fetch("WC", "2022")   # turnuva + yıl ile
"""

from __future__ import annotations

import logging
import warnings
from datetime import date
from typing import Optional

from .base import BaseSource
from .schema import IngestionResult, MatchRecord, PlayerStatRecord, ShotRecord

warnings.filterwarnings("ignore")
log = logging.getLogger(__name__)

# (competition_id, season_id) → (standart_lig_kodu, sezon_str, turnuva_ismi)
_TURNUVALAR: dict[tuple[int, int], tuple[str, str, str]] = {
    (43,  106): ("WC",         "2022", "FIFA World Cup 2022"),
    (43,  3):   ("WC",         "2018", "FIFA World Cup 2018"),
    (55,  282): ("Euro",       "2024", "UEFA Euro 2024"),
    (55,  43):  ("Euro",       "2020", "UEFA Euro 2020"),
    (223, 282): ("CopaAmerica","2024", "Copa América 2024"),
    (11,  90):  ("LaLiga",     "2020", "La Liga 2020/21"),
    (7,   235): ("Ligue1",     "2022", "Ligue 1 2022/23"),
    (9,   281): ("Bundesliga", "2023", "Bundesliga 2023/24"),
    (16,  4):   ("UCL",        "2018", "Champions League 2018/19"),
    (16,  1):   ("UCL",        "2017", "Champions League 2017/18"),
    (16,  2):   ("UCL",        "2016", "Champions League 2016/17"),
    (16, 27):   ("UCL",        "2015", "Champions League 2015/16"),
    (16, 26):   ("UCL",        "2014", "Champions League 2014/15"),
}

# Kısa kod → (comp_id, season_id) → lig + sezon
_KISALTMA_MAP: dict[str, tuple[int, int]] = {
    "wc2022":     (43,  106),
    "wc2018":     (43,  3),
    "euro2024":   (55,  282),
    "euro2020":   (55,  43),
    "copa2024":   (223, 282),
    "laliga":     (11,  90),
    "ligue1":     (7,   235),
    "bundesliga": (9,   281),
    "ucl":        (16,  4),
}

# Lig kodu bazında desteklenen sezonlar (şu an tek sezon her biri)
_LIG_SEZONLAR: dict[str, list[str]] = {
    "WC":          ["2022", "2018"],
    "Euro":        ["2024", "2020"],
    "CopaAmerica": ["2024"],
    "LaLiga":      ["2020"],
    "Ligue1":      ["2022"],
    "Bundesliga":  ["2023"],
    "UCL":         ["2018"],
}


class StatsBombSource(BaseSource):
    """
    StatsBomb Open Data'dan maç + oyuncu istatistikleri + şutlar.

    fetch() üç şey döndürür:
      - matches: maç sonuçları
      - player_stats: oyuncu sezon istatistikleri (maç bazlı toplam)
      - shots: xG'li şut koordinatları (dakika + period dahil)
    """

    name = "statsbomb"

    def available_leagues(self) -> list[str]:
        return list(_LIG_SEZONLAR.keys())

    def available_seasons(self, league: str) -> list[str]:
        return _LIG_SEZONLAR.get(league, [])

    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        StatsBomb Open Data'dan bir turnuva + sezon için tüm veriyi çeker.

        Parametre olarak lig kodu ("WC", "Euro", "LaLiga" vb.) ve
        sezon yılı ("2022", "2024" vb.) alır. Alternatif olarak
        fetch("wc2022", "") şeklinde kısa kod ile de çağrılabilir.

        Args:
            league: Standart lig kodu veya kısa kod (örn. "wc2022")
            season: Sezon başlangıç yılı ("2022") — kısa kod kullanılırsa boş bırakılabilir
        """
        result = IngestionResult(source=self.name, lig=league, sezon=season)

        # Kısa kod desteği
        if league in _KISALTMA_MAP:
            comp_id, season_id = _KISALTMA_MAP[league]
        else:
            # Lig + sezon bazlı arama
            bulunan = [
                (cid, sid) for (cid, sid), (lig, sez, _) in _TURNUVALAR.items()
                if lig == league and sez == season
            ]
            if not bulunan:
                result.errors.append(
                    f"StatsBomb'da {league} {season} bulunamadı. "
                    f"Desteklenen: {list(_KISALTMA_MAP.keys())}"
                )
                return result
            comp_id, season_id = bulunan[0]

        lig_kodu, sezon_str, turnuva_ismi = _TURNUVALAR.get(
            (comp_id, season_id),
            (league, season, f"{league} {season}"),
        )

        # Gerçek lig kodu ve sezon'u güncelle (kısa kod geldiyse)
        result.lig   = lig_kodu
        result.sezon = sezon_str

        try:
            from statsbombpy import sb
        except ImportError:
            result.errors.append("statsbombpy kütüphanesi yüklü değil: pip install statsbombpy")
            return result

        # ── Maç listesi ───────────────────────────────────────────────────────
        try:
            matches_df = sb.matches(competition_id=comp_id, season_id=season_id)
        except Exception as exc:
            result.errors.append(f"StatsBomb maç listesi HATA: {exc}")
            return result

        for _, m in matches_df.iterrows():
            record = _match_to_record(m, lig_kodu, sezon_str, turnuva_ismi, self.name)
            if record:
                result.matches.append(record)

        # ── Şut eventleri + oyuncu istatistikleri ────────────────────────────
        # TODO: İmplemente edilecek — her maç için sb.events() çağrısı yapılacak,
        #       Shot event'leri ShotRecord'a, agg istatistikler PlayerStatRecord'a dönüştürülecek.
        #
        # Örnek (şu an placeholder):
        #   for _, m in matches_df.iterrows():
        #       events = sb.events(match_id=int(m["match_id"]))
        #       shots = events[events["type"] == "Shot"]
        #       for _, s in shots.iterrows():
        #           shot = _shot_to_record(s, lig_kodu, sezon_str, m, self.name)
        #           if shot:
        #               result.shots.append(shot)
        #
        # Not: migrate_shots_dakika.py bu işlemi zaten yapıyor.
        #      Bu modül tamamlanırken duplicate oluşmaması için koordinasyon gerekli.

        return result


# ── DataFrame satırı → MatchRecord ───────────────────────────────────────────

def _match_to_record(row, lig: str, sezon: str, turnuva: str, source: str) -> Optional[MatchRecord]:
    """StatsBomb maç DataFrame satırını MatchRecord'a dönüştür."""
    try:
        tarih_str = str(row.get("match_date", ""))[:10]
        if not tarih_str or tarih_str == "nan":
            return None
        tarih = date.fromisoformat(tarih_str)

        ev  = str(row.get("home_team", ""))
        dep = str(row.get("away_team", ""))
        if not ev or not dep:
            return None

        ev_gol  = row.get("home_score")
        dep_gol = row.get("away_score")

        return MatchRecord(
            source        = source,
            lig           = lig,
            sezon         = sezon,
            tarih         = tarih,
            ev_takim      = ev,
            dep_takim     = dep,
            turnuva       = turnuva,
            ev_gol        = int(ev_gol)  if ev_gol  is not None else None,
            dep_gol       = int(dep_gol) if dep_gol is not None else None,
            kaynak_mac_id = f"sb_{int(row.get('match_id', 0))}",
        )
    except Exception as exc:
        log.debug("StatsBomb maç dönüşüm hatası: %s", exc)
        return None


def _shot_to_record(row, lig: str, sezon: str, mac_row, source: str) -> Optional[ShotRecord]:
    """StatsBomb shot event satırını ShotRecord'a dönüştür."""
    try:
        loc = row.get("location", [None, None])
        if not loc or len(loc) < 2:
            return None
        x = float(loc[0])
        y = float(loc[1])

        tarih_str = str(mac_row.get("match_date", ""))[:10]
        mac_tarih = date.fromisoformat(tarih_str)

        outcome  = str(row.get("shot_outcome", "")).lower()
        gol_mu   = outcome == "goal"
        xg_val   = row.get("shot_statsbomb_xg")

        return ShotRecord(
            source      = source,
            lig         = lig,
            sezon       = sezon,
            oyuncu_isim = str(row.get("player", "")),
            mac_tarih   = mac_tarih,
            ev_takim    = str(mac_row.get("home_team", "")),
            dep_takim   = str(mac_row.get("away_team", "")),
            x           = round(x, 2),
            y           = round(y, 2),
            gol_mu      = gol_mu,
            xg          = float(xg_val) if xg_val is not None else None,
            dakika      = int(row.get("minute", 0) or 0) or None,
            period      = int(row.get("period",  1) or 1),
        )
    except Exception as exc:
        log.debug("StatsBomb şut dönüşüm hatası: %s", exc)
        return None
