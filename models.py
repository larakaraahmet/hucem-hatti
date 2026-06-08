"""Paylaşılan Pydantic modelleri — tüm router'lar buradan import eder."""

from typing import Optional

from pydantic import BaseModel, Field


class Per90Metrics(BaseModel):
    xg90:        float = Field(description="90 dakika başına beklenen gol")
    xa90:        float = Field(description="90 dakika başına beklenen asist")
    gol90:       float = Field(description="90 dakika başına gol")
    asist90:     float = Field(description="90 dakika başına asist")
    sut90:       float = Field(description="90 dakika başına şut")
    isabetli90:  float = Field(description="90 dakika başına isabetli şut")
    prog_pass90: float = Field(description="90 dakika başına ilerletici pas")


class PercentileMetrics(BaseModel):
    xg90:        float = Field(ge=0, le=100)
    xa90:        float = Field(ge=0, le=100)
    gol90:       float = Field(ge=0, le=100)
    asist90:     float = Field(ge=0, le=100)
    sut90:       float = Field(ge=0, le=100)
    isabetli90:  float = Field(ge=0, le=100)
    prog_pass90: float = Field(ge=0, le=100)


class PlayerProfileResponse(BaseModel):
    oyuncu_id:     int
    isim:          str
    mevki:         Optional[str]
    milliyet:      Optional[str]
    dogum_tarihi:  Optional[str]
    mac_sayisi:    int
    toplam_dakika: int
    per90:         Per90Metrics
    club_takim:    Optional[str] = None
    club_lig:      Optional[str] = None
    has_data:      bool = True


class SimilarPlayerResponse(BaseModel):
    oyuncu_id: int
    isim:      str
    mevki:     Optional[str]
    benzerlik: float = Field(ge=0, le=100)
    per90:     Per90Metrics


class ShotResponse(BaseModel):
    id:      int
    x_konum: float
    y_konum: float
    xg:      Optional[float]
    gol_mu:  bool


class PercentilesResponse(BaseModel):
    oyuncu_id:     int
    isim:          str
    mevki:         Optional[str]
    mac_sayisi:    int
    toplam_dakika: int
    per90:         Per90Metrics
    percentile:    PercentileMetrics


class InsightResponse(BaseModel):
    oyuncu_id: int
    isim:      str
    insight:   str
    usage:     dict


class PlayerMatchRecord(BaseModel):
    mac_id:           int
    tarih:            str
    turnuva:          str
    ev_takim:         str
    deplasman_takim:  str
    dakika:           Optional[int]
    gol:              int
    asist:            int
    sut:              int
    isabetli_sut:     int
    xg:               Optional[float]
    xa:               Optional[float]
    progressive_pass: Optional[int]
    saha_isim:        Optional[str]    = None
    saha_sehir:       Optional[str]    = None
    saha_ulke:        Optional[str]    = None
    saha_kapasite:    Optional[int]    = None
    saha_rakim:       Optional[int]    = None
    saha_cim_turu:    Optional[str]    = None
    saha_lat:         Optional[float]  = None
    saha_lon:         Optional[float]  = None
    saha_acilis_yili: Optional[int]    = None
    saha_boyut:       Optional[str]    = None


class CompetitionStatsRecord(BaseModel):
    turnuva:      str
    mac_sayisi:   int
    dakika:       int
    gol:          int
    asist:        int
    xg:           float
    xa:           float
    sut:          int
    isabetli_sut: int


class TeamSummary(BaseModel):
    ulke:          str
    oyuncu_sayisi: int


class PlayerSummary(BaseModel):
    oyuncu_id: int
    isim:      str
    mevki:     Optional[str]
    milliyet:  Optional[str]
    has_data:  Optional[bool] = True


class TeamSummaryDetail(BaseModel):
    ulke:          str
    oyuncu_sayisi: int
    ort_yas:       Optional[float]
    toplam_gol:    int
    toplam_xg:     float
    mac_sayisi:    int
    en_iyi_oyuncu: Optional[str]
    en_iyi_xg:     Optional[float]


class LoginRequest(BaseModel):
    sifre: str
