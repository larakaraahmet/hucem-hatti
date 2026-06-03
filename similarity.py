"""
Oyuncu benzerlik motoru.
Metrik vektörlerini standardize edip cosine similarity ile en benzer
5 oyuncuyu bulur.
"""

from typing import Any
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy import Engine

from metrics import get_all_metrics, RADAR_METRICS

# Benzerlik hesabında kullanılacak sütunlar (per-90 metrikler)
_FEATURE_COLS: list[str] = [col for col, _ in RADAR_METRICS]

# ---------------------------------------------------------------------------
# Mevki bazlı ağırlıklar
# Hangi metriğin o pozisyon için daha ayırt edici olduğunu belirtir.
# Ağırlık vektörü, standardize edilmiş X'in her sütununa çarpılır.
# ---------------------------------------------------------------------------

_FORWARD_POSITIONS = {
    "Center Forward", "Right Center Forward", "Left Center Forward",
    "Right Wing", "Left Wing", "Right Wing Forward", "Left Wing Forward",
    "Second Striker",
}
_MIDFIELDER_POSITIONS = {
    "Center Midfield", "Right Center Midfield", "Left Center Midfield",
    "Attacking Midfield", "Defensive Midfield", "Right Midfield", "Left Midfield",
    "Right Attacking Midfield", "Left Attacking Midfield",
    "Right Defensive Midfield", "Left Defensive Midfield",
}
_DEFENDER_POSITIONS = {
    "Center Back", "Right Center Back", "Left Center Back",
    "Right Back", "Left Back", "Right Wing Back", "Left Wing Back",
    "Right Defensive Midfield", "Left Defensive Midfield",
}

# Her pozisyon grubu için sütun ağırlıkları:
# sütun sırası: xg90, xa90, gol90, asist90, sut90, isabetli90, prog_pass90
_POS_WEIGHTS: dict[str, list[float]] = {
    "forward":   [1.6, 0.9, 1.8, 0.7, 1.4, 1.4, 0.8],
    "midfielder":[1.0, 1.5, 1.0, 1.5, 0.9, 0.9, 1.6],
    "defender":  [0.7, 1.2, 0.7, 1.2, 0.8, 0.8, 1.8],
    "default":   [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
}


def _position_weight_vector(mevki: str | None) -> np.ndarray:
    """Oyuncunun mevkisine göre özellik ağırlık vektörü döner."""
    if mevki in _FORWARD_POSITIONS:
        w = _POS_WEIGHTS["forward"]
    elif mevki in _MIDFIELDER_POSITIONS:
        w = _POS_WEIGHTS["midfielder"]
    elif mevki in _DEFENDER_POSITIONS:
        w = _POS_WEIGHTS["defender"]
    else:
        w = _POS_WEIGHTS["default"]
    return np.array(w, dtype=float)


# ---------------------------------------------------------------------------
# Vektör matrisi oluşturma (önbellek için module-level saklıyoruz)
# ---------------------------------------------------------------------------

def _build_matrix(df: pd.DataFrame) -> tuple[np.ndarray, StandardScaler]:
    """
    Per-90 sütunlarından standardize edilmiş özellik matrisi döner.
    NaN → 0 doldurulur (maçta o metriği hiç üretmemiş oyuncular için).
    """
    X = df[_FEATURE_COLS].fillna(0).to_numpy(dtype=float)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    return X_scaled, scaler


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------

def find_similar_players(
    player_id: int,
    engine: Engine,
    top_n: int = 5,
    min_minutes: int = 90,
    same_position_only: bool = False,
) -> list[dict[str, Any]]:
    """
    Verilen oyuncuya en benzer top_n oyuncuyu döner.

    Args:
        player_id:          Hedef oyuncunun players.id değeri
        engine:             SQLAlchemy engine
        top_n:              Kaç benzer oyuncu döneceği
        min_minutes:        Havuza dahil edilecek minimum dakika
        same_position_only: True ise sadece aynı mevkiyi karşılaştırır

    Returns:
        [
            {
              "oyuncu_id": int,
              "isim": str,
              "mevki": str,
              "benzerlik": float,   # 0–100 arası yüzde
              "per90": dict,
            },
            ...
        ]

    Raises:
        ValueError: oyuncu bulunamazsa veya min_minutes koşulunu sağlamazsa
    """
    df = get_all_metrics(engine, min_minutes=min_minutes)

    if df.empty:
        raise ValueError("Veritabanında yeterli oyuncu verisi bulunamadı.")

    # Hedef oyuncuyu bul
    target_mask = df["oyuncu_id"] == player_id
    if not target_mask.any():
        raise ValueError(
            f"Oyuncu {player_id} bulunamadı veya {min_minutes} dakika koşulunu sağlamıyor."
        )

    # Opsiyonel: aynı mevki filtresi (hedef oyuncu hariç tutulmadan önce uygulanır)
    if same_position_only:
        target_position = df.loc[target_mask, "mevki"].iloc[0]
        if target_position:
            # Hedef oyuncuyu + aynı mevkiyi al
            df = df[(df["mevki"] == target_position) | target_mask].reset_index(drop=True)
            target_mask = df["oyuncu_id"] == player_id

    # Standardize edilmiş matris
    X_scaled, _ = _build_matrix(df)

    target_idx = int(np.where(target_mask.to_numpy())[0][0])

    # Mevki bazlı ağırlık uygula — hedef oyuncunun mevkisine göre
    target_position = df.iloc[target_idx]["mevki"] if "mevki" in df.columns else None
    weights = _position_weight_vector(target_position)
    X_weighted = X_scaled * weights  # her özellik sütununa ağırlık çarp

    target_vec = X_weighted[target_idx].reshape(1, -1)

    # Tüm oyuncularla cosine similarity (1×N)
    similarities = cosine_similarity(target_vec, X_weighted)[0]  # shape: (N,)

    # Cosine similarity [-1, 1] → yüzde [0, 100]
    # Negatif değerler 0'a sabitlenir (zıt profil anlamlı değil)
    sim_pct = np.clip(similarities * 100, 0, 100)

    # Kendisini dışarıda bırak, en yüksek N skoru al
    sim_pct[target_idx] = -1
    top_indices = np.argsort(sim_pct)[::-1][:top_n]

    results: list[dict[str, Any]] = []
    for idx in top_indices:
        row = df.iloc[idx]
        per90 = {col: float(row[col]) for col in _FEATURE_COLS}
        results.append({
            "oyuncu_id": int(row["oyuncu_id"]),
            "isim":      str(row["isim"]),
            "mevki":     str(row["mevki"]) if row["mevki"] else None,
            "benzerlik": round(float(sim_pct[idx]), 1),
            "per90":     per90,
        })

    return results


# ---------------------------------------------------------------------------
# İki oyuncu arası tek seferlik benzerlik skoru
# ---------------------------------------------------------------------------

def player_similarity_score(
    player_a: int,
    player_b: int,
    engine: Engine,
    min_minutes: int = 90,
) -> float:
    """
    İki oyuncu arasındaki benzerlik yüzdesini döner (0–100).
    Radar grafiğinde "bu oyuncu %91 oranında X'e benziyor" ifadesi için.
    """
    df = get_all_metrics(engine, min_minutes=min_minutes)

    for pid in (player_a, player_b):
        if not (df["oyuncu_id"] == pid).any():
            raise ValueError(f"Oyuncu {pid} bulunamadı veya {min_minutes} dakika koşulunu sağlamıyor.")

    X_scaled, _ = _build_matrix(df)

    idx_a = int(np.where((df["oyuncu_id"] == player_a).to_numpy())[0][0])
    idx_b = int(np.where((df["oyuncu_id"] == player_b).to_numpy())[0][0])

    score = cosine_similarity(
        X_scaled[idx_a].reshape(1, -1),
        X_scaled[idx_b].reshape(1, -1),
    )[0][0]

    return round(float(np.clip(score * 100, 0, 100)), 1)
