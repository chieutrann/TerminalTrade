"""RSI divergence detection."""
from typing import Optional

from app.models.candle import Candle


def detect_rsi_divergence(
    candles: list[Candle],
    rsi_values: list[Optional[float]],
    lookback: int = 5,
) -> list[dict]:
    """
    Detect bullish and bearish RSI divergence.

    Bullish: price makes lower low, RSI makes higher low (signal potential reversal up)
    Bearish: price makes higher high, RSI makes lower high (signal potential reversal down)
    """
    n = len(candles)
    result = []

    for i in range(lookback * 2, n):
        rsi_now = rsi_values[i]
        if rsi_now is None:
            continue

        pivot_lo, pivot_rsi_lo = _find_pivot_low(candles, rsi_values, i - lookback, lookback)
        pivot_hi, pivot_rsi_hi = _find_pivot_high(candles, rsi_values, i - lookback, lookback)

        if pivot_lo is not None and pivot_rsi_lo is not None:
            if candles[i].low < candles[pivot_lo].low and rsi_now > rsi_values[pivot_lo]:
                result.append(
                    {
                        "time": candles[i].time,
                        "type": "bullish",
                        "price": candles[i].low,
                        "rsi_value": rsi_now,
                    }
                )

        if pivot_hi is not None and pivot_rsi_hi is not None:
            if candles[i].high > candles[pivot_hi].high and rsi_now < rsi_values[pivot_hi]:
                result.append(
                    {
                        "time": candles[i].time,
                        "type": "bearish",
                        "price": candles[i].high,
                        "rsi_value": rsi_now,
                    }
                )

    return result


def _find_pivot_low(
    candles: list[Candle],
    rsi_values: list[Optional[float]],
    center: int,
    lookback: int,
) -> tuple[Optional[int], Optional[float]]:
    start = max(0, center - lookback)
    end = min(len(candles) - 1, center + lookback)
    candidates = [
        i for i in range(start, end + 1)
        if rsi_values[i] is not None and candles[i].low == min(candles[j].low for j in range(start, end + 1))
    ]
    if not candidates:
        return None, None
    idx = candidates[0]
    return idx, rsi_values[idx]


def _find_pivot_high(
    candles: list[Candle],
    rsi_values: list[Optional[float]],
    center: int,
    lookback: int,
) -> tuple[Optional[int], Optional[float]]:
    start = max(0, center - lookback)
    end = min(len(candles) - 1, center + lookback)
    candidates = [
        i for i in range(start, end + 1)
        if rsi_values[i] is not None and candles[i].high == max(candles[j].high for j in range(start, end + 1))
    ]
    if not candidates:
        return None, None
    idx = candidates[0]
    return idx, rsi_values[idx]
