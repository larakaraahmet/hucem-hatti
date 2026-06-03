"""
sources/schema.py — Ortak veri şeması
======================================

Tüm kaynak modülleri (Understat, StatsBomb, openfootball vb.) verilerini
bu şemaya dönüştürür. Böylece DB yazıcısı tek bir formata bakarak
matches, player_external_stats ve shots tablolarına kayıt ekler.

Sezon formatı: year-başlangıç tam yıl olarak "2024" (= 2024/25 sezonu).
               Tek-yıllık turnuvalar için de "2022" gibi yıl kullanılır.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


# ── Ortak kayıt tipleri ───────────────────────────────────────────────────────

@dataclass
class MatchRecord:
    """Tek bir maça ait temel bilgiler (tüm kaynaklarda ortak)."""

    # Zorunlu alanlar
    source: str               # "understat" | "statsbomb" | "openfootball" | "footballdata_org" | "footballdata_couk"
    lig: str                  # Standart lig kodu: "EPL", "LaLiga", "Bundesliga", "SerieA", "Ligue1", "SuperLig" …
    sezon: str                # Başlangıç yılı: "2024" (= 2024/25), "2022" (WC 2022)
    tarih: date               # Maç tarihi
    ev_takim: str             # Ev takımı (kaynak orijinal ismi)
    dep_takim: str            # Deplasman takımı (kaynak orijinal ismi)
    turnuva: str              # "EPL 2024/25", "FIFA World Cup 2022" vb.

    # Opsiyonel
    ev_gol: Optional[int] = None
    dep_gol: Optional[int] = None
    ht_ev_gol: Optional[int] = None        # İlk yarı skoru
    ht_dep_gol: Optional[int] = None
    kaynak_mac_id: Optional[str] = None    # Kaynağa özgü ID (dedup için)


@dataclass
class PlayerStatRecord:
    """Bir oyuncunun sezon özet istatistikleri."""

    # Zorunlu
    source: str
    lig: str
    sezon: str
    oyuncu_isim: str          # Kaynak orijinal ismi
    takim: str                # Kulüp ismi

    # Maç katılımı
    mac_sayisi: Optional[int] = None
    dakika: Optional[int] = None

    # Gol istatistikleri
    gol: Optional[int] = None
    asist: Optional[int] = None
    np_gol: Optional[int] = None           # Penaltısız gol

    # xG metrikleri (Understat / StatsBomb)
    xg: Optional[float] = None
    xa: Optional[float] = None
    npxg: Optional[float] = None

    # Şut
    sut: Optional[int] = None
    isabetli_sut: Optional[int] = None

    # Disiplin
    sari_kart: Optional[int] = None
    kirmizi_kart: Optional[int] = None


@dataclass
class ShotRecord:
    """Tek bir şut girişimi."""

    # Zorunlu
    source: str
    lig: str
    sezon: str
    oyuncu_isim: str
    mac_tarih: date
    ev_takim: str
    dep_takim: str
    x: float                  # StatsBomb koordinat sistemi (0–120)
    y: float                  # StatsBomb koordinat sistemi (0–80)
    gol_mu: bool

    # Opsiyonel
    xg: Optional[float] = None
    dakika: Optional[int] = None
    period: Optional[int] = None


# ── İngestion sonucu ─────────────────────────────────────────────────────────

@dataclass
class IngestionResult:
    """
    Tek bir fetch() çağrısının dönüş değeri.
    Üç liste: matches, player_stats, shots.
    Hata varsa errors listesine eklenir (exception fırlatmak yerine).
    """
    source: str
    lig: str
    sezon: str

    matches:      list[MatchRecord]      = field(default_factory=list)
    player_stats: list[PlayerStatRecord] = field(default_factory=list)
    shots:        list[ShotRecord]       = field(default_factory=list)
    errors:       list[str]              = field(default_factory=list)

    @property
    def toplam(self) -> int:
        return len(self.matches) + len(self.player_stats) + len(self.shots)

    def __repr__(self) -> str:
        return (
            f"IngestionResult(source={self.source!r}, lig={self.lig!r}, "
            f"sezon={self.sezon!r}, "
            f"matches={len(self.matches)}, "
            f"player_stats={len(self.player_stats)}, "
            f"shots={len(self.shots)}, "
            f"errors={len(self.errors)})"
        )
