"""Base exchange interface."""
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Callable, Optional

from app.models.candle import Candle

logger = logging.getLogger(__name__)


class BaseExchange(ABC):
    """Abstract base for exchange adapters."""

    name: str = "base"

    @abstractmethod
    async def fetch_historical_candles(
        self, symbol: str, interval: str, limit: int = 500, before: int | None = None
    ) -> list[Candle]:
        """Fetch historical OHLCV candles."""

    @abstractmethod
    async def subscribe_candles(
        self,
        symbol: str,
        interval: str,
        on_candle: Callable[[Candle], None],
    ) -> asyncio.Task:
        """
        Start streaming candles for symbol/interval.
        Returns the background task so callers can cancel it.
        """

    @abstractmethod
    def get_supported_symbols(self) -> list[str]:
        """Return normalized symbols this exchange supports."""


def aggregate_candles(
    base_candles: list[Candle],
    target_seconds: int,
) -> list[Candle]:
    """
    Aggregate a list of fine-grained candles into larger candles
    aligned to target_seconds boundaries.
    """
    if not base_candles:
        return []

    buckets: dict[int, Candle] = {}

    for c in base_candles:
        bucket_time = (c.time // target_seconds) * target_seconds
        if bucket_time not in buckets:
            buckets[bucket_time] = Candle(
                time=bucket_time,
                open=c.open,
                high=c.high,
                low=c.low,
                close=c.close,
                volume=c.volume,
                is_closed=False,
            )
        else:
            agg = buckets[bucket_time]
            agg.high = max(agg.high, c.high)
            agg.low = min(agg.low, c.low)
            agg.close = c.close
            agg.volume += c.volume

    sorted_candles = sorted(buckets.values(), key=lambda x: x.time)
    if sorted_candles:
        for c in sorted_candles[:-1]:
            c.is_closed = True
        sorted_candles[-1].is_closed = False

    return sorted_candles
