"""Tests for candle normalization, interval parsing, and aggregation."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from backend.app.config import parse_interval_seconds, INTERVAL_PATTERN
from backend.app.exchanges.base import aggregate_candles
from backend.app.models.candle import Candle


def test_valid_interval_parsing():
    cases = [
        ("1s", 1),
        ("5s", 5),
        ("45s", 45),
        ("1m", 60),
        ("7m", 420),
        ("30m", 1800),
        ("90m", 5400),
        ("1h", 3600),
        ("4h", 14400),
        ("6h", 21600),
        ("1d", 86400),
        ("2d", 172800),
    ]
    for interval, expected in cases:
        result = parse_interval_seconds(interval)
        assert result == expected, f"{interval}: expected {expected}, got {result}"


def test_invalid_interval_patterns():
    invalid = ["0m", "0s", "abc", "1x", "-1m", "m1", "1M", "", "1min"]
    for interval in invalid:
        m = INTERVAL_PATTERN.match(interval)
        assert m is None, f"Expected {interval!r} to fail pattern, but it matched"


def test_interval_pattern_valid():
    valid = ["1s", "5s", "45s", "1m", "7m", "90m", "1h", "4h", "1d", "2d", "30d"]
    for interval in valid:
        m = INTERVAL_PATTERN.match(interval)
        assert m is not None, f"Expected {interval!r} to match pattern"


def _make_1m_candles(count: int, start_time: int = 0) -> list[Candle]:
    candles = []
    for i in range(count):
        t = start_time + i * 60
        candles.append(Candle(
            time=t,
            open=100.0 + i,
            high=105.0 + i,
            low=95.0 + i,
            close=102.0 + i,
            volume=10.0,
            is_closed=True,
        ))
    return candles


def test_7m_candle_aggregation():
    """7m candle should start at timestamps divisible by 420s."""
    candles = _make_1m_candles(70, start_time=0)
    aggregated = aggregate_candles(candles, 420)
    for c in aggregated:
        assert c.time % 420 == 0, f"7m candle time {c.time} not aligned to 420s boundary"


def test_45s_candle_aggregation():
    """45s candle should start at timestamps divisible by 45s."""
    candles = [
        Candle(time=i * 15, open=100.0, high=101.0, low=99.0, close=100.5, volume=1.0, is_closed=True)
        for i in range(100)
    ]
    aggregated = aggregate_candles(candles, 45)
    for c in aggregated:
        assert c.time % 45 == 0, f"45s candle time {c.time} not aligned to 45s"


def test_90m_candle_aggregation():
    """90m candle should start at timestamps divisible by 5400s."""
    candles = _make_1m_candles(200, start_time=0)
    aggregated = aggregate_candles(candles, 5400)
    for c in aggregated:
        assert c.time % 5400 == 0, f"90m candle time {c.time} not aligned to 5400s"


def test_candle_ohlcv_aggregation():
    """OHLCV values must aggregate correctly."""
    candles = [
        Candle(time=0, open=100.0, high=110.0, low=90.0, close=105.0, volume=5.0, is_closed=True),
        Candle(time=60, open=105.0, high=120.0, low=100.0, close=115.0, volume=8.0, is_closed=True),
        Candle(time=120, open=115.0, high=125.0, low=105.0, close=110.0, volume=6.0, is_closed=True),
    ]
    aggregated = aggregate_candles(candles, 180)
    assert len(aggregated) == 1
    c = aggregated[0]
    assert c.time == 0
    assert c.open == 100.0
    assert c.high == 125.0
    assert c.low == 90.0
    assert c.close == 110.0
    assert abs(c.volume - 19.0) < 1e-9


def test_candle_is_closed():
    """All aggregated candles except the last should have is_closed=True."""
    candles = _make_1m_candles(15, start_time=0)
    aggregated = aggregate_candles(candles, 300)
    if len(aggregated) > 1:
        for c in aggregated[:-1]:
            assert c.is_closed is True
    if aggregated:
        assert aggregated[-1].is_closed is False


def test_empty_candle_aggregation():
    """Empty input returns empty output."""
    result = aggregate_candles([], 60)
    assert result == []


def test_candle_boundary_alignment():
    """Candles at different times must fall into correct 5m buckets."""
    candles = [
        Candle(time=60, open=100.0, high=101.0, low=99.0, close=100.5, volume=1.0, is_closed=True),
        Candle(time=120, open=100.5, high=102.0, low=100.0, close=101.0, volume=1.0, is_closed=True),
        Candle(time=300, open=101.0, high=103.0, low=100.5, close=102.0, volume=1.0, is_closed=True),
    ]
    aggregated = aggregate_candles(candles, 300)
    times = {c.time for c in aggregated}
    assert 0 in times, "Expected bucket at 0"
    assert 300 in times, "Expected bucket at 300"


if __name__ == "__main__":
    test_valid_interval_parsing()
    test_invalid_interval_patterns()
    test_interval_pattern_valid()
    test_7m_candle_aggregation()
    test_45s_candle_aggregation()
    test_90m_candle_aggregation()
    test_candle_ohlcv_aggregation()
    test_candle_is_closed()
    test_empty_candle_aggregation()
    test_candle_boundary_alignment()
    print("All candle tests passed!")
