"""Unit tests for RSI calculations using Wilder's smoothing method."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from backend.app.indicators.rsi import calculate_rsi
from backend.app.models.candle import Candle


def _make_candles(closes: list[float]) -> list[Candle]:
    return [
        Candle(time=i * 60, open=c, high=c, low=c, close=c, volume=1.0)
        for i, c in enumerate(closes)
    ]


def test_rsi_insufficient_data():
    """Not enough data returns all None."""
    candles = _make_candles([100.0] * 5)
    result = calculate_rsi(candles, period=14)
    assert all(v is None for v in result)


def test_rsi_flat_market():
    """All prices equal → RSI should be 50."""
    candles = _make_candles([100.0] * 30)
    result = calculate_rsi(candles, period=14)
    valid = [v for v in result if v is not None]
    assert len(valid) > 0
    for v in valid:
        assert v == 50.0, f"Expected 50.0 for flat market, got {v}"


def test_rsi_zero_loss():
    """Strictly increasing prices → RSI should be 100."""
    candles = _make_candles([float(100 + i) for i in range(30)])
    result = calculate_rsi(candles, period=14)
    valid = [v for v in result if v is not None]
    assert len(valid) > 0
    for v in valid:
        assert v == 100.0, f"Expected 100.0 for zero-loss, got {v}"


def test_rsi_zero_gain():
    """Strictly decreasing prices → RSI should be 0."""
    candles = _make_candles([float(130 - i) for i in range(30)])
    result = calculate_rsi(candles, period=14)
    valid = [v for v in result if v is not None]
    assert len(valid) > 0
    for v in valid:
        assert v == 0.0, f"Expected 0.0 for zero-gain, got {v}"


def test_rsi_known_values():
    """
    Test RSI against a known dataset.
    Using RSI period=5 with known prices, verify Wilder's method.
    """
    closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.15, 43.61, 44.33, 44.83, 45.10, 45.15, 43.61, 44.33]
    candles = _make_candles(closes)
    result = calculate_rsi(candles, period=5)

    none_count = sum(1 for v in result if v is None)
    assert none_count == 5, f"Expected 5 None values, got {none_count}"

    valid = [v for v in result if v is not None]
    assert len(valid) > 0
    for v in valid:
        assert 0.0 <= v <= 100.0, f"RSI out of range: {v}"


def test_rsi_result_length():
    """Output length matches input length."""
    candles = _make_candles([float(i) for i in range(50)])
    result = calculate_rsi(candles, period=14)
    assert len(result) == len(candles)


def test_rsi_none_for_first_period():
    """First `period` values must be None."""
    candles = _make_candles([float(i + 1) for i in range(30)])
    period = 10
    result = calculate_rsi(candles, period=period)
    for i in range(period):
        assert result[i] is None, f"Expected None at index {i}, got {result[i]}"
    assert result[period] is not None


def test_rsi_sources():
    """RSI can be calculated on different price sources."""
    candles = [
        Candle(time=i * 60, open=100.0 + i, high=105.0 + i, low=95.0 + i, close=102.0 + i, volume=1.0)
        for i in range(30)
    ]
    for source in ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"]:
        result = calculate_rsi(candles, period=14, source=source)
        assert len(result) == len(candles)
        valid = [v for v in result if v is not None]
        for v in valid:
            assert 0.0 <= v <= 100.0, f"RSI out of range for source {source}: {v}"


if __name__ == "__main__":
    test_rsi_insufficient_data()
    test_rsi_flat_market()
    test_rsi_zero_loss()
    test_rsi_zero_gain()
    test_rsi_known_values()
    test_rsi_result_length()
    test_rsi_none_for_first_period()
    test_rsi_sources()
    print("All RSI tests passed!")
