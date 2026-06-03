"""
sources/base.py — Tüm kaynak modüllerinin soyut temel sınıfı
=============================================================

Her kaynak modülü (Understat, StatsBomb, openfootball …) bu sınıfı
miras alır ve fetch() metodunu uygular. Böylece main.py orchestrator'ı
kaynakları polimorfik olarak kullanabilir.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Optional

from .schema import IngestionResult

log = logging.getLogger(__name__)


class BaseSource(ABC):
    """
    Veri kaynağı temel sınıfı.

    Alt sınıflar şunları uygulamalı:
      - name          → kaynak adı ("understat", "statsbomb", …)
      - available_leagues()  → desteklenen lig kodu listesi
      - available_seasons()  → bir lig için desteklenen sezon listesi
      - fetch()       → veriyi çek, IngestionResult döndür
    """

    # Alt sınıf tanımlar
    name: str = "base"

    def __init__(self, dry_run: bool = False, cache: bool = True):
        """
        Args:
            dry_run: True ise veri çekilir ama DB'ye yazılmaz.
            cache:   False ise soccerdata / requests önbelleği atlanır.
        """
        self.dry_run = dry_run
        self.cache   = cache

    # ── Soyut metodlar ────────────────────────────────────────────────────────

    @abstractmethod
    def available_leagues(self) -> list[str]:
        """Bu kaynak için desteklenen standart lig kodları."""
        ...

    @abstractmethod
    def available_seasons(self, league: str) -> list[str]:
        """
        Belirli bir lig için desteklenen sezon listesi.
        Sezon formatı: başlangıç yılı string, örn. ["2022", "2023", "2024"].
        """
        ...

    @abstractmethod
    def fetch(self, league: str, season: str) -> IngestionResult:
        """
        Tek bir lig + sezon kombinasyonu için veri çeker.

        Args:
            league: Standart lig kodu ("EPL", "LaLiga", "SuperLig", …)
            season: Başlangıç yılı ("2024" = 2024/25 sezonu)

        Returns:
            IngestionResult: matches, player_stats, shots listeleriyle dolu.
            Hata durumunda exception fırlatmak yerine result.errors'a ekle.
        """
        ...

    # ── Ortak yardımcı metodlar ───────────────────────────────────────────────

    def fetch_all(
        self,
        leagues: Optional[list[str]] = None,
        seasons: Optional[list[str]] = None,
    ) -> list[IngestionResult]:
        """
        Belirtilen (veya tüm desteklenen) lig + sezon kombinasyonları için
        fetch() çağırır. Hata olursa loglayıp devam eder.

        Args:
            leagues: None ise available_leagues() kullanılır.
            seasons: None ise her lig için available_seasons() kullanılır.
        """
        hedef_ligler = leagues or self.available_leagues()
        sonuclar: list[IngestionResult] = []

        for lig in hedef_ligler:
            hedef_sezonlar = seasons or self.available_seasons(lig)
            for sezon in hedef_sezonlar:
                log.info("[%s] %s %s çekiliyor…", self.name, lig, sezon)
                try:
                    result = self.fetch(lig, sezon)
                    if result.errors:
                        for err in result.errors:
                            log.warning("[%s] %s %s — %s", self.name, lig, sezon, err)
                    log.info(
                        "[%s] %s %s → %d maç, %d oyuncu, %d şut",
                        self.name, lig, sezon,
                        len(result.matches), len(result.player_stats), len(result.shots),
                    )
                    sonuclar.append(result)
                except Exception as exc:
                    log.error(
                        "[%s] %s %s HATA: %s — kaynak atlanıyor",
                        self.name, lig, sezon, exc,
                    )
                    sonuclar.append(IngestionResult(
                        source=self.name, lig=lig, sezon=sezon,
                        errors=[str(exc)],
                    ))

        return sonuclar

    def __repr__(self) -> str:
        mode = "dry-run" if self.dry_run else "live"
        return f"{self.__class__.__name__}(name={self.name!r}, mode={mode})"
