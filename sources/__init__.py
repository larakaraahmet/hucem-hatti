"""
sources/ — Modüler veri kaynağı paketi
========================================

Her kaynak kendi modülünde; hepsi ortak şemaya yazar.

Kaynak modülleri:
    understat        → Big 5 ligi xG + şut (soccerdata)
    openfootball     → Kulüp ligleri + Süper Lig fikstür/sonuç (JSON, anahtarsız)
    footballdata_org → Büyük 5 + Avrupa kupaları (REST API, ücretsiz key gerekli)
    footballdata_couk→ Geçmiş sonuç + H2H (CSV indirme)
    statsbomb        → Turnuva + derin metrik (statsbombpy, açık veri)

Hızlı kullanım:
    from sources import tum_kaynaklar
    for src in tum_kaynaklar():
        results = src.fetch_all()
        ...
"""

from .schema import IngestionResult, MatchRecord, PlayerStatRecord, ShotRecord
from .base   import BaseSource
from .writer import DBWriter

from .understat          import UnderstatSource
from .openfootball       import OpenfootballSource
from .footballdata_org   import FootballDataOrgSource
from .footballdata_couk  import FootballDataCoUkSource
from .statsbomb          import StatsBombSource


def tum_kaynaklar(
    dry_run: bool = False,
    cache:   bool = True,
) -> list[BaseSource]:
    """
    Tüm kaynak örneklerini bir liste olarak döndürür.
    main.py orchestrator'ı bu fonksiyonu kullanır.
    """
    return [
        UnderstatSource(dry_run=dry_run,         cache=cache),
        OpenfootballSource(dry_run=dry_run,      cache=cache),
        FootballDataOrgSource(dry_run=dry_run,   cache=cache),
        FootballDataCoUkSource(dry_run=dry_run,  cache=cache),
        StatsBombSource(dry_run=dry_run,         cache=cache),
    ]


__all__ = [
    # Şema
    "IngestionResult",
    "MatchRecord",
    "PlayerStatRecord",
    "ShotRecord",
    # Temel sınıf
    "BaseSource",
    "DBWriter",
    # Kaynaklar
    "UnderstatSource",
    "OpenfootballSource",
    "FootballDataOrgSource",
    "FootballDataCoUkSource",
    "StatsBombSource",
    # Yardımcı
    "tum_kaynaklar",
]
