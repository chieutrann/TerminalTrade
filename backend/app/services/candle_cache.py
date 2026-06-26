"""In-memory candle cache with bounded history."""
import logging
from collections import OrderedDict
from typing import Optional

from app.models.candle import Candle

logger = logging.getLogger(__name__)

MAX_CANDLES_PER_STREAM = 2000


class CandleCache:
    """Thread-safe in-memory store of recent candles per (symbol, interval)."""

    def __init__(self) -> None:
        self._data: dict[tuple[str, str], OrderedDict[int, Candle]] = {}

    def _key(self, symbol: str, interval: str) -> tuple[str, str]:
        return (symbol, interval)

    def upsert(self, symbol: str, interval: str, candle: Candle) -> None:
        key = self._key(symbol, interval)
        if key not in self._data:
            self._data[key] = OrderedDict()
        bucket = self._data[key]
        bucket[candle.time] = candle
        if len(bucket) > MAX_CANDLES_PER_STREAM:
            bucket.popitem(last=False)

    def get_recent(self, symbol: str, interval: str, limit: int = 500) -> list[Candle]:
        key = self._key(symbol, interval)
        bucket = self._data.get(key, OrderedDict())
        candles = list(bucket.values())
        return candles[-limit:]

    def seed(self, symbol: str, interval: str, candles: list[Candle]) -> None:
        """Bulk-load historical candles into cache."""
        key = self._key(symbol, interval)
        self._data[key] = OrderedDict()
        for c in sorted(candles, key=lambda x: x.time):
            self._data[key][c.time] = c
            if len(self._data[key]) > MAX_CANDLES_PER_STREAM:
                self._data[key].popitem(last=False)

    def has_data(self, symbol: str, interval: str) -> bool:
        key = self._key(symbol, interval)
        return bool(self._data.get(key))
