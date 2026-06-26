"""Stochastic RSI calculation."""
from typing import Optional


def calculate_stoch_rsi(
    rsi_values: list[Optional[float]],
    timestamps: list[int],
    period: int = 14,
    smooth_k: int = 3,
    smooth_d: int = 3,
) -> list[dict]:
    """
    Calculate Stochastic RSI.
    Returns list of {time, k, d} dicts.
    """
    n = len(rsi_values)
    result = [{"time": timestamps[i], "k": None, "d": None} for i in range(n)]

    valid = [(i, v) for i, v in enumerate(rsi_values) if v is not None]
    if len(valid) < period:
        return result

    valid_indices = [x[0] for x in valid]
    values = [float(x[1]) for x in valid]
    m = len(values)

    raw_k: list[Optional[float]] = [None] * m
    for j in range(period - 1, m):
        window = values[j - period + 1 : j + 1]
        lo = min(window)
        hi = max(window)
        if hi == lo:
            raw_k[j] = 50.0
        else:
            raw_k[j] = 100.0 * (values[j] - lo) / (hi - lo)

    smoothed_k: list[Optional[float]] = [None] * m
    for j in range(period - 1 + smooth_k - 1, m):
        window_k = [raw_k[x] for x in range(j - smooth_k + 1, j + 1) if raw_k[x] is not None]
        if len(window_k) == smooth_k:
            smoothed_k[j] = sum(window_k) / smooth_k

    smoothed_d: list[Optional[float]] = [None] * m
    for j in range(period - 1 + smooth_k - 1 + smooth_d - 1, m):
        window_d = [smoothed_k[x] for x in range(j - smooth_d + 1, j + 1) if smoothed_k[x] is not None]
        if len(window_d) == smooth_d:
            smoothed_d[j] = sum(window_d) / smooth_d

    for j, global_idx in enumerate(valid_indices):
        result[global_idx]["k"] = smoothed_k[j]
        result[global_idx]["d"] = smoothed_d[j]

    return result
