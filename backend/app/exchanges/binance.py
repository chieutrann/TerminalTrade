"""Binance Spot exchange adapter."""
import asyncio
import json
import logging
import time
from typing import Callable, Optional

import httpx
import websockets
from websockets.exceptions import ConnectionClosed

from app.config import BINANCE_REST_URL, BINANCE_WS_URL, BINANCE_SYMBOLS, BINANCE_INTERVAL_MAP
from app.exchanges.base import BaseExchange, aggregate_candles
from app.models.candle import Candle

logger = logging.getLogger(__name__)

NATIVE_INTERVAL_SECONDS = set(BINANCE_INTERVAL_MAP.keys())

BINANCE_STR_TO_SECONDS = {v: k for k, v in BINANCE_INTERVAL_MAP.items()}


def _parse_interval_seconds(interval: str) -> int:
    from app.config import parse_interval_seconds
    return parse_interval_seconds(interval)


def _best_base_interval(target_seconds: int) -> tuple[str, int]:
    """Return the best native Binance interval to aggregate from."""
    candidates = sorted(
        [(secs, name) for secs, name in BINANCE_INTERVAL_MAP.items() if secs <= target_seconds],
        reverse=True,
    )
    if candidates:
        best_secs, best_name = candidates[0]
        return best_name, best_secs
    return "1m", 60


def _normalize_symbol(symbol: str) -> str:
    """Convert BTC/USDT → BTCUSDT."""
    return BINANCE_SYMBOLS[symbol]


def _parse_kline_to_candle(k: list, is_closed: bool = True) -> Candle:
    return Candle(
        time=int(k[0]) // 1000,
        open=float(k[1]),
        high=float(k[2]),
        low=float(k[3]),
        close=float(k[4]),
        volume=float(k[5]),
        is_closed=is_closed,
    )


class BinanceExchange(BaseExchange):
    name = "binance"

    def get_supported_symbols(self) -> list[str]:
        return list(BINANCE_SYMBOLS.keys())

    async def fetch_historical_candles(
        self, symbol: str, interval: str, limit: int = 500, before: int | None = None
    ) -> list[Candle]:
        target_seconds = _parse_interval_seconds(interval)
        binance_sym = _normalize_symbol(symbol)

        if target_seconds in NATIVE_INTERVAL_SECONDS:
            native_interval = BINANCE_INTERVAL_MAP[target_seconds]
            return await self._fetch_native(binance_sym, native_interval, limit, before)
        else:
            base_name, base_secs = _best_base_interval(target_seconds)
            needed = min(int((limit * target_seconds) / base_secs) + 10, 1000)
            base_candles = await self._fetch_native(binance_sym, base_name, needed, before)
            aggregated = aggregate_candles(base_candles, target_seconds)
            return aggregated[-limit:]

    async def _fetch_native(
        self, binance_sym: str, interval: str, limit: int, before: int | None = None
    ) -> list[Candle]:
        url = f"{BINANCE_REST_URL}/api/v3/klines"
        params: dict[str, str | int] = {"symbol": binance_sym, "interval": interval, "limit": min(limit, 1000)}
        if before is not None:
            params["endTime"] = before * 1000
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
        return [_parse_kline_to_candle(k, is_closed=True) for k in data]

    async def subscribe_candles(
        self,
        symbol: str,
        interval: str,
        on_candle: Callable[[Candle], None],
    ) -> asyncio.Task:
        target_seconds = _parse_interval_seconds(interval)
        binance_sym = _normalize_symbol(symbol).lower()

        if target_seconds in NATIVE_INTERVAL_SECONDS:
            native_interval = BINANCE_INTERVAL_MAP[target_seconds]
            task = asyncio.create_task(
                self._stream_native(binance_sym, native_interval, symbol, interval, on_candle)
            )
        else:
            base_name, base_secs = _best_base_interval(target_seconds)
            task = asyncio.create_task(
                self._stream_aggregated(
                    binance_sym, base_name, base_secs, symbol, interval, target_seconds, on_candle
                )
            )
        return task

    async def _stream_native(
        self,
        binance_sym: str,
        native_interval: str,
        norm_symbol: str,
        norm_interval: str,
        on_candle: Callable[[Candle], None],
    ) -> None:
        url = f"{BINANCE_WS_URL}/{binance_sym}@kline_{native_interval}"
        backoff = 1.0
        while True:
            try:
                logger.info(f"Binance WS connecting: {url}")
                async with websockets.connect(url, ping_interval=20, ping_timeout=10) as ws:
                    backoff = 1.0
                    logger.info(f"Binance WS connected: {norm_symbol} {norm_interval}")
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            k = msg.get("k", {})
                            candle = Candle(
                                time=int(k["t"]) // 1000,
                                open=float(k["o"]),
                                high=float(k["h"]),
                                low=float(k["l"]),
                                close=float(k["c"]),
                                volume=float(k["v"]),
                                is_closed=bool(k.get("x", False)),
                            )
                            on_candle(candle)
                        except Exception as e:
                            logger.warning(f"Binance WS parse error: {e}")
            except asyncio.CancelledError:
                logger.info(f"Binance stream cancelled: {norm_symbol} {norm_interval}")
                return
            except Exception as e:
                logger.error(f"Binance WS error: {e}. Reconnecting in {backoff}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)

    async def _stream_aggregated(
        self,
        binance_sym: str,
        base_name: str,
        base_secs: int,
        norm_symbol: str,
        norm_interval: str,
        target_seconds: int,
        on_candle: Callable[[Candle], None],
    ) -> None:
        """Aggregate a smaller stream into custom-sized candles."""
        url = f"{BINANCE_WS_URL}/{binance_sym}@kline_{base_name}"
        current_bucket: Optional[Candle] = None
        backoff = 1.0

        while True:
            try:
                logger.info(f"Binance aggregated WS connecting: {url} → {norm_interval}")
                async with websockets.connect(url, ping_interval=20, ping_timeout=10) as ws:
                    backoff = 1.0
                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            k = msg.get("k", {})
                            base = Candle(
                                time=int(k["t"]) // 1000,
                                open=float(k["o"]),
                                high=float(k["h"]),
                                low=float(k["l"]),
                                close=float(k["c"]),
                                volume=float(k["v"]),
                                is_closed=bool(k.get("x", False)),
                            )
                            bucket_time = (base.time // target_seconds) * target_seconds

                            if current_bucket is None or current_bucket.time != bucket_time:
                                if current_bucket is not None:
                                    current_bucket.is_closed = True
                                    on_candle(current_bucket)
                                current_bucket = Candle(
                                    time=bucket_time,
                                    open=base.open,
                                    high=base.high,
                                    low=base.low,
                                    close=base.close,
                                    volume=base.volume,
                                    is_closed=False,
                                )
                            else:
                                current_bucket.high = max(current_bucket.high, base.high)
                                current_bucket.low = min(current_bucket.low, base.low)
                                current_bucket.close = base.close
                                current_bucket.volume += base.volume
                                current_bucket.is_closed = False

                            on_candle(current_bucket)
                        except Exception as e:
                            logger.warning(f"Binance aggregated parse error: {e}")
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error(f"Binance aggregated WS error: {e}. Reconnecting in {backoff}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
