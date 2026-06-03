"""
Oyuncu metrik hesaplama modülü.
90 dakika başına normalize edilmiş istatistikler ve tüm oyuncular içindeki
yüzdelik dilimler döner. Radar/pizza grafik bu çıktıyı doğrudan tüketir.
"""

from typing import Any
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text

# ---------------------------------------------------------------------------
# SQL: turnuva genelinde tüm oyuncuların ham toplamları
# ---------------------------------------------------------------------------
_SQL_ALL_PLAYERS = """
SELECT
    p.id                          AS oyuncu_id,
    p.isim,
    p.mevki,
    COUNT(pms.mac_id)             AS mac_sayisi,
    SUM(pms.dakika)               AS toplam_dakika,
    SUM(pms.gol)                  AS toplam_gol,
    SUM(pms.asist)                AS toplam_asist,
    SUM(pms.sut)                  AS toplam_sut,
    SUM(pms.isabetli_sut)         AS toplam_isabetli_sut,
    COALESCE(SUM(pms.xg),  0)     AS toplam_xg,
    COALESCE(SUM(pms.xa),  0)     AS toplam_xa,
    COALESCE(SUM(pms.progressive_pass), 0) AS toplam_prog_pass
FROM players p
JOIN player_match_stats pms ON p.id = pms.oyuncu_id
GROUP BY p.id, p.isim, p.mevki
HAVING SUM(pms.dakika) >= :min_dakika
ORDER BY p.id
"""

# Radar grafikte gösterilecek metrik sütunları ve etiketleri
RADAR_METRICS: list[tuple[str, str]] = [
    ("xg90",         "xG/90"),
    ("xa90",         "xA/90"),
    ("gol90",        "Gol/90"),
    ("asist90",      "Asist/90"),
    ("sut90",        "Şut/90"),
    ("isabetli90",   "İsabetli Şut/90"),
    ("prog_pass90",  "Prog. Pas/90"),
]


# ---------------------------------------------------------------------------
# Yardımcılar
# ---------------------------------------------------------------------------

def _per90(value: float, minutes: float) -> float:
    """Metriği 90 dakikaya normalize eder; dakika yoksa 0 döner."""
    if not minutes or minutes <= 0:
        return 0.0
    return round((value / minutes) * 90, 3)


def _percentile_of(arr: np.ndarray, val: float) -> float:
    """
    val'ın arr içindeki yüzdelik dilimini [0, 100] aralığında döner.
    arr'daki değerlerin val'dan küçük ya da eşit olanlarının oranıdır.
    """
    if len(arr) == 0:
        return 0.0
    return round(float(np.mean(arr <= val) * 100), 1)


def _build_per90(row: pd.Series) -> dict[str, float]:
    """Tek bir oyuncu satırından per-90 metriklerini hesaplar."""
    m = row["toplam_dakika"]
    return {
        "xg90":        _per90(row["toplam_xg"],        m),
        "xa90":        _per90(row["toplam_xa"],         m),
        "gol90":       _per90(row["toplam_gol"],        m),
        "asist90":     _per90(row["toplam_asist"],      m),
        "sut90":       _per90(row["toplam_sut"],        m),
        "isabetli90":  _per90(row["toplam_isabetli_sut"], m),
        "prog_pass90": _per90(row["toplam_prog_pass"],  m),
    }


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------

def get_player_metrics(
    player_id: int,
    engine: Engine,
    min_minutes: int = 90,
) -> dict[str, Any]:
    """
    Bir oyuncunun 90 dakikaya normalize edilmiş metriklerini ve
    tüm oyuncular içindeki yüzdelik dilimlerini döner.

    Args:
        player_id:   players.id değeri
        engine:      SQLAlchemy engine
        min_minutes: yüzdelik dilim havuzuna dahil edilecek minimum dakika
                     (gürültülü örnekleri dışarıda tutar)

    Returns:
        {
          "oyuncu_id": int,
          "isim": str,
          "mevki": str,
          "mac_sayisi": int,
          "toplam_dakika": int,
          "per90": { "xg90": float, ... },
          "percentile": { "xg90": float, ... },   # 0–100 arası
        }

    Raises:
        ValueError: oyuncu bulunamazsa veya min_minutes koşulunu sağlamazsa
    """
    with engine.connect() as conn:
        rows = conn.execute(text(_SQL_ALL_PLAYERS), {"min_dakika": min_minutes})
        df = pd.DataFrame(rows.mappings())

    if df.empty:
        raise ValueError("Veritabanında yeterli veri bulunamadı.")

    # Tüm oyuncular için per-90 hesapla
    per90_all = df.apply(_build_per90, axis=1, result_type="expand")
    # per90_all: DataFrame, satırlar oyuncular, sütunlar metrikler

    # Hedef oyuncuyu bul
    player_row = df[df["oyuncu_id"] == player_id]
    if player_row.empty:
        raise ValueError(
            f"Oyuncu {player_id} bulunamadı veya {min_minutes} dakika koşulunu sağlamıyor."
        )

    idx         = player_row.index[0]
    player_data = player_row.iloc[0]
    player_p90  = per90_all.loc[idx].to_dict()

    # Her metrik için yüzdelik dilimi hesapla
    percentiles: dict[str, float] = {}
    for metric in player_p90:
        col_values = per90_all[metric].to_numpy(dtype=float)
        percentiles[metric] = _percentile_of(col_values, player_p90[metric])

    return {
        "oyuncu_id":     int(player_data["oyuncu_id"]),
        "isim":          str(player_data["isim"]),
        "mevki":         str(player_data["mevki"]) if player_data["mevki"] else None,
        "mac_sayisi":    int(player_data["mac_sayisi"]),
        "toplam_dakika": int(player_data["toplam_dakika"]),
        "per90":         player_p90,
        "percentile":    percentiles,
    }


# ---------------------------------------------------------------------------
# Toplu sorgular (ileride karşılaştırma / sıralama için)
# ---------------------------------------------------------------------------

def get_all_metrics(engine: Engine, min_minutes: int = 90) -> pd.DataFrame:
    """
    Tüm oyuncuların per-90 metriklerini ve yüzdelik dilimlerini döner.
    Oyuncu karşılaştırma ve benzerlik motoru bu fonksiyonu kullanır.
    """
    with engine.connect() as conn:
        rows = conn.execute(text(_SQL_ALL_PLAYERS), {"min_dakika": min_minutes})
        df = pd.DataFrame(rows.mappings())

    if df.empty:
        return pd.DataFrame()

    per90_df = df.apply(_build_per90, axis=1, result_type="expand")

    pct_df = per90_df.apply(
        lambda col: col.map(lambda val: _percentile_of(col.to_numpy(dtype=float), val))
    ).rename(columns=lambda c: f"{c}_pct")

    result = pd.concat(
        [df[["oyuncu_id", "isim", "mevki", "mac_sayisi", "toplam_dakika"]], per90_df, pct_df],
        axis=1,
    )
    return result
