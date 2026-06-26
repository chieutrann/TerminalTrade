"""
RSI implementation using Wilder's original smoothing method.

Algorithm:
- delta = current_close - previous_close
- gain = max(delta, 0)
- loss = abs(min(delta, 0))
- Initial avg_gain = SMA of first N gains
- Initial avg_loss = SMA of first N losses
- Subsequent avg_gain = ((prev_avg_gain * (N - 1)) + current_gain) / N
- Subsequent avg_loss = ((prev_avg_loss * (N - 1)) + current_loss) / N
- RS = avg_gain / avg_loss
- RSI = 100 - (100 / (1 + RS))
- If avg_loss == 0: RSI = 100
- If avg_gain == 0 and avg_loss == 0: RSI = 50
- Returns None for candles where RSI cannot yet be calculated
"""
from typing import Optional
import numpy as np

from app.models.candle import Candle


SOURCE_FIELDS = {
    "close": lambda c: c.close,
    "open": lambda c: c.open,
    "high": lambda c: c.high,
    "low": lambda c: c.low,
    "hl2": lambda c: (c.high + c.low) / 2,
    "hlc3": lambda c: (c.high + c.low + c.close) / 3,
    "ohlc4": lambda c: (c.open + c.high + c.low + c.close) / 4,
}


def extract_source(candles: list[Candle], source: str) -> list[float]:
    extractor = SOURCE_FIELDS.get(source)
    if extractor is None:
        raise ValueError(f"Unknown source: {source!r}. Valid: {list(SOURCE_FIELDS)}")
    return [extractor(c) for c in candles]


def calculate_rsi(
    candles: list[Candle], period: int = 14, source: str = "close"
) -> list[Optional[float]]:
    """
    Calculate RSI using Wilder's smoothing method.
    Returns a list of the same length as candles.
    Values at indices < period are None (not enough data).
    """
    prices = extract_source(candles, source)
    n = len(prices)
    result: list[Optional[float]] = [None] * n

    if n < period + 1:
        return result

    deltas = [prices[i] - prices[i - 1] for i in range(1, n)]
    gains = [max(d, 0.0) for d in deltas]
    losses = [abs(min(d, 0.0)) for d in deltas]

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    def compute_rsi(ag: float, al: float) -> float:
        if ag == 0 and al == 0:
            return 50.0
        if al == 0:
            return 100.0
        rs = ag / al
        return 100.0 - (100.0 / (1.0 + rs))

    result[period] = compute_rsi(avg_gain, avg_loss)

    for i in range(period + 1, n):
        g = gains[i - 1]
        l = losses[i - 1]
        avg_gain = (avg_gain * (period - 1) + g) / period
        avg_loss = (avg_loss * (period - 1) + l) / period
        result[i] = compute_rsi(avg_gain, avg_loss)

    return result


def calculate_rsi_ma(
    rsi_values: list[Optional[float]],
    timestamps: list[int],
    period: int = 14,
    ma_type: str = "sma",
) -> list[Optional[float]]:
    """Calculate a moving average over RSI values (SMA, EMA, or WMA)."""
    n = len(rsi_values)
    result: list[Optional[float]] = [None] * n

    valid_indices = [i for i, v in enumerate(rsi_values) if v is not None]
    if not valid_indices:
        return result

    values = [rsi_values[i] for i in valid_indices]

    if ma_type == "sma":
        ma_values = _sma(values, period)
    elif ma_type == "ema":
        ma_values = _ema(values, period)
    elif ma_type == "wma":
        ma_values = _wma(values, period)
    else:
        raise ValueError(f"Unknown ma_type: {ma_type!r}")

    for idx, global_idx in enumerate(valid_indices):
        result[global_idx] = ma_values[idx]

    return result


def _sma(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    for i in range(period - 1, n):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def _ema(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    if n < period:
        return result
    k = 2.0 / (period + 1)
    ema = sum(values[:period]) / period
    result[period - 1] = ema
    for i in range(period, n):
        ema = values[i] * k + ema * (1 - k)
        result[i] = ema
    return result


def _wma(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    weights = list(range(1, period + 1))
    total_weight = sum(weights)
    for i in range(period - 1, n):
        window = values[i - period + 1 : i + 1]
        result[i] = sum(w * v for w, v in zip(weights, window)) / total_weight
    return result


def calculate_rsi_bollinger_bands(
    rsi_values: list[Optional[float]],
    timestamps: list[int],
    period: int = 20,
    std_dev: float = 2.0,
) -> list[dict]:
    """Calculate Bollinger Bands over RSI values."""
    n = len(rsi_values)
    result = [{"time": timestamps[i], "upper": None, "middle": None, "lower": None} for i in range(n)]

    valid_vals = [(i, v) for i, v in enumerate(rsi_values) if v is not None]
    if len(valid_vals) < period:
        return result

    valid_indices = [x[0] for x in valid_vals]
    values = [x[1] for x in valid_vals]
    m = len(values)

    for j in range(period - 1, m):
        window = values[j - period + 1 : j + 1]
        mean = sum(window) / period
        variance = sum((x - mean) ** 2 for x in window) / period
        std = variance ** 0.5
        global_idx = valid_indices[j]
        result[global_idx]["middle"] = mean
        result[global_idx]["upper"] = mean + std_dev * std
        result[global_idx]["lower"] = mean - std_dev * std

    return result
