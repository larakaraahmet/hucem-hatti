"""metrics.py birim testleri — DB gerektirmez."""

import pandas as pd
import numpy as np
import pytest

from metrics import _per90, _percentile_of, _build_per90, RADAR_METRICS


def test_per90_basic():
    assert _per90(9, 90) == pytest.approx(9.0)
    assert _per90(18, 180) == pytest.approx(9.0)
    assert _per90(0, 90) == 0.0


def test_per90_zero_minutes():
    assert _per90(5, 0) == 0.0
    assert _per90(5, -1) == 0.0


def test_percentile_of_median():
    arr = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    pct = _percentile_of(arr, 3.0)
    assert 50.0 <= pct <= 70.0


def test_percentile_of_max():
    arr = np.array([1.0, 2.0, 3.0])
    assert _percentile_of(arr, 3.0) == 100.0


def test_percentile_of_min():
    arr = np.array([1.0, 2.0, 3.0])
    assert _percentile_of(arr, 0.0) == 0.0


def test_percentile_of_empty():
    assert _percentile_of(np.array([]), 1.0) == 0.0


def test_build_per90_keys():
    row = pd.Series({
        "toplam_dakika": 900,
        "toplam_xg": 3.6,
        "toplam_xa": 1.8,
        "toplam_gol": 4,
        "toplam_asist": 2,
        "toplam_sut": 27,
        "toplam_isabetli_sut": 9,
        "toplam_prog_pass": 45,
    })
    result = _build_per90(row)
    assert set(result.keys()) == {"xg90", "xa90", "gol90", "asist90", "sut90", "isabetli90", "prog_pass90"}
    assert result["xg90"] == pytest.approx(0.36)
    assert result["gol90"] == pytest.approx(0.4)


def test_radar_metrics_structure():
    assert len(RADAR_METRICS) == 7
    for col, label in RADAR_METRICS:
        assert isinstance(col, str)
        assert isinstance(label, str)
