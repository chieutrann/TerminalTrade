"""Moving average utilities used across indicators."""
from typing import Optional


def sma(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    for i in range(period - 1, n):
        result[i] = sum(values[i - period + 1 : i + 1]) / period
    return result


def ema(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    if n < period:
        return result
    k = 2.0 / (period + 1)
    current_ema = sum(values[:period]) / period
    result[period - 1] = current_ema
    for i in range(period, n):
        current_ema = values[i] * k + current_ema * (1 - k)
        result[i] = current_ema
    return result


def wma(values: list[float], period: int) -> list[Optional[float]]:
    n = len(values)
    result: list[Optional[float]] = [None] * n
    weights = list(range(1, period + 1))
    total_weight = sum(weights)
    for i in range(period - 1, n):
        window = values[i - period + 1 : i + 1]
        result[i] = sum(w * v for w, v in zip(weights, window)) / total_weight
    return result
