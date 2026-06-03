"""
sources/openfootball.py — openfootball veri kaynağı
====================================================

openfootball JSON dosyalarından fikstür + sonuç verisi çeker.
İki farklı openfootball repo'sunu destekler:

  1. openfootball/football.json
     → Büyük 5 lig + Süper Lig + diğer kulüp ligleri
     URL: https://raw.githubusercontent.com/openfootball/football.json/master/{season}/{code}.json

  2. openfootball/worldcup
     → Dünya Kupası geçmiş (1930–2022), zaten ingest_openfootball.py ile yüklendi.
        Bu modül tekrar yüklememek için bu kaynağı atlar.

Desteklenen ligler:
    EPL, LaLiga, Bundesliga, SerieA, Ligue1, SuperLig, Eredivisie, PrimeiraLiga, ...

Gereken .env değişkeni: yok (GitHub raw, API anahtarı gerekmez)

Kullanım:
    from sources.openfootball import OpenfootballSource
    src = OpenfootballSource()
    result = src.fetch("SuperLig", "2023")
"""

from __future__ import annotations

import logging
import time
from datetime import date
from typing import Optional

import requests

from .base import BaseSource
from .schema import IngestionResult, MatchRecord

log = logging.getLogger(__name__)

# ── Lig kodu → openfootball dosya yolu eşlemesi ──────────────────────────────
# Format: (github_repo_path, dosya_adı_şablonu)
# Sezon formatı: {yy}/{yy+1} → örn. 2024/25 için "24-25"
_LIG_MAP: dict[str, dict] = {
    "EPL": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/en.1.json",          # örn. 2024-25/en.1.json
        "turnuva_prefix": "EPL",
    },
    "LaLiga": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/es.1.json",
        "turnuva_prefix": "La Liga",
    },
    "Bundesliga": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/de.1.json",
        "turnuva_prefix": "Bundesliga",
    },
    "SerieA": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/it.1.json",
        "turnuva_prefix": "Serie A",
    },
    "Ligue1": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/fr.1.json",
        "turnuva_prefix": "Ligue 1",
    },
    "SuperLig": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/tr.1.json",          # Süper Lig
        "turnuva_prefix": "Süper Lig",
    },
    "Eredivisie": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/nl.1.json",
        "turnuva_prefix": "Eredivisie",
    },
    "PrimeiraLiga": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/pt.1.json",
        "turnuva_prefix": "Primeira Liga",
    },
    "ScottishPL": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/sco.1.json",
        "turnuva_prefix": "Scottish PL",
    },
    "BelgiumPD": {
        "repo": "openfootball/football.json",
        "path": "{sezon}/be.1.json",
        "turnuva_prefix": "Belgium Pro League",
    },
}

# Desteklenen sezonlar (başlangıç yılı)
_SEZONLAR = ["2018", "2019", "2020", "2021", "2022", "2023", "2024"]

_GITHUB_RAW = "https://raw.githubusercontent.com/{repo}/master/{path}"


def _sezon_kodu(sezon: str) -> str:
    """
    "2024" → "2024-25" (openfootball dosya adı formatı)
    """
    y = int(sezon)
    return f"{y}-{str(y+1)[-2:]}"


class OpenfootballSource(BaseSource):
    """
    openfootball/football.json üzerinden kulüp ligi fikstür ve sonuçları.

    Sadece maç sonuçları döner (player_stats ve shots boş).
    xG verisi mevcut değil.
    """

    name = "openfootball"

    def available_leagues(self) -> list[str]:
        return list(_LIG_MAP.keys())

    def available_seasons(self, league: str) -> list[str]:
        return _SEZONLAR.copy()

    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        openfootball JSON'dan bir lig + sezon için maç sonuçlarını çeker.

        Args:
            league: "EPL" | "LaLiga" | "Bundesliga" | "SerieA" | "Ligue1" |
                    "SuperLig" | "Eredivisie" | "PrimeiraLiga" | ...
            season: Başlangıç yılı str ("2024" = 2024/25 sezonu)
        """
        result = IngestionResult(source=self.name, lig=league, sezon=season)

        if league not in _LIG_MAP:
            result.errors.append(f"Desteklenmeyen lig: {league}. Geçerli: {list(_LIG_MAP)}")
            return result

        lig_cfg = _LIG_MAP[league]
        sezon_kodu = _sezon_kodu(season)
        dosya_yolu = lig_cfg["path"].format(sezon=sezon_kodu)
        url = _GITHUB_RAW.format(repo=lig_cfg["repo"], path=dosya_yolu)

        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 404:
                result.errors.append(f"openfootball: {sezon_kodu} sezonu bulunamadı ({url})")
                return result
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as exc:
            result.errors.append(f"HTTP hatası: {exc}")
            return result
        except Exception as exc:
            result.errors.append(f"JSON parse hatası: {exc}")
            return result

        # JSON iki farklı yapıda gelebilir:
        #   A) {"name": "...", "matches": [{...}, ...]}  ← en yaygın (football.json)
        #   B) {"name": "...", "rounds": [{"name": "...", "matches": [{...}]}]}
        turnuva = f"{lig_cfg['turnuva_prefix']} {season}/{str(int(season)+1)[-2:]}"

        if "matches" in data:
            # Yapı A: maçlar doğrudan üst seviyede
            for mac in data["matches"]:
                record = _mac_to_record(mac, league, season, turnuva, self.name)
                if record:
                    result.matches.append(record)
        elif "rounds" in data:
            # Yapı B: maçlar round'lar içinde
            for rnd in data["rounds"]:
                for mac in rnd.get("matches", []):
                    record = _mac_to_record(mac, league, season, turnuva, self.name)
                    if record:
                        result.matches.append(record)

        time.sleep(0.3)  # GitHub'a nazik ol
        return result


# ── JSON → MatchRecord ────────────────────────────────────────────────────────

def _mac_to_record(mac: dict, lig: str, sezon: str, turnuva: str, source: str) -> Optional[MatchRecord]:
    """
    openfootball JSON maç nesnesini MatchRecord'a dönüştür.

    Desteklenen format:
      {"round": "Matchday 1", "date": "2023-08-11", "time": "20:00",
       "team1": "Arsenal FC", "team2": "Wolves FC",
       "score": {"ht": [1, 0], "ft": [2, 1]}}
    """
    try:
        tarih_str = mac.get("date", "")
        if not tarih_str:
            return None
        tarih = date.fromisoformat(str(tarih_str)[:10])

        # team1/team2: düz string veya {"name": "...", "key": "..."} dict olabilir
        t1 = mac.get("team1", "")
        t2 = mac.get("team2", "")
        ev  = t1 if isinstance(t1, str) else t1.get("name", t1.get("key", ""))
        dep = t2 if isinstance(t2, str) else t2.get("name", t2.get("key", ""))
        if not ev or not dep:
            return None

        skor   = mac.get("score", {}) or {}
        ft     = skor.get("ft")   # [ev_gol, dep_gol]
        ht     = skor.get("ht")   # [ht_ev, ht_dep]

        return MatchRecord(
            source        = source,
            lig           = lig,
            sezon         = sezon,
            tarih         = tarih,
            ev_takim      = ev,
            dep_takim     = dep,
            turnuva       = turnuva,
            ev_gol        = int(ft[0]) if ft and len(ft) >= 2 else None,
            dep_gol       = int(ft[1]) if ft and len(ft) >= 2 else None,
            ht_ev_gol     = int(ht[0]) if ht and len(ht) >= 2 else None,
            ht_dep_gol    = int(ht[1]) if ht and len(ht) >= 2 else None,
            kaynak_mac_id = f"of_{lig}_{sezon}_{tarih}_{str(ev)[:4]}_{str(dep)[:4]}",
        )
    except Exception as exc:
        log.debug("openfootball maç dönüşüm hatası: %s — %s", exc, mac)
        return None
