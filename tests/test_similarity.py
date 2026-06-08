"""similarity.py birim testleri — DB gerektirmez."""

import numpy as np
import pandas as pd
import pytest

from similarity import _position_weight_vector, _build_matrix, _POS_WEIGHTS


def _mock_df(n=10):
    """Basit sahte oyuncu DataFrame'i."""
    rng = np.random.default_rng(42)
    cols = ["xg90", "xa90", "gol90", "asist90", "sut90", "isabetli90", "prog_pass90"]
    data = rng.uniform(0, 1, (n, len(cols)))
    df = pd.DataFrame(data, columns=cols)
    df["oyuncu_id"] = range(1, n + 1)
    df["isim"] = [f"Oyuncu {i}" for i in range(1, n + 1)]
    half = n // 2
    df["mevki"] = ["Center Forward"] * half + ["Center Midfield"] * (n - half)
    df["dogum_tarihi"] = pd.to_datetime(["1995-01-01"] * n)
    df["mac_sayisi"] = 20
    df["toplam_dakika"] = 1800
    return df


def test_position_weight_forward():
    w = _position_weight_vector("Center Forward")
    assert w.shape == (7,)
    assert w[0] >= 1.5  # xg90 ağırlığı yüksek


def test_position_weight_midfielder():
    w = _position_weight_vector("Center Midfield")
    assert w[6] >= 1.5  # prog_pass90 ağırlığı yüksek


def test_position_weight_default():
    w = _position_weight_vector(None)
    assert np.allclose(w, np.ones(7))


def test_build_matrix_shape():
    df = _mock_df(10)
    X, scaler = _build_matrix(df)
    assert X.shape == (10, 7)


def test_build_matrix_standardized():
    df = _mock_df(20)
    X, _ = _build_matrix(df)
    # Standardize edilmiş matrisin her sütununun ortalaması ~0, std ~1 olmalı
    assert np.abs(X.mean(axis=0)).max() < 0.1
    assert np.abs(X.std(axis=0) - 1).max() < 0.2


def test_build_matrix_nan_fill():
    df = _mock_df(5)
    df.loc[0, "xg90"] = np.nan
    X, _ = _build_matrix(df)
    assert not np.isnan(X).any()


def test_pos_weights_length():
    for name, weights in _POS_WEIGHTS.items():
        assert len(weights) == 7, f"{name} ağırlık vektörü 7 elemanlı olmalı"
