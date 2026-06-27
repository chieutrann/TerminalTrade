"""Coinbase Exchange (public) adapter — no API key required."""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Callable, Optional

import httpx
import websockets

from app.config import (
    COINBASE_REST_URL,
    COINBASE_WS_URL,
    COINBASE_USD_SYMBOLS,
    COINBASE_GRANULARITY_MAP,
    parse_interval_config,
)
from app.exchanges.base import BaseExchange, aggregate_candles
from app.models.candle import Candle

logger = logging.getLogger(__name__)

NATIVE_COINBASE_SECONDS = set(COINBASE_GRANULARITY_MAP.keys())


def _normalize_symbol(symbol: str) -> str:
    return COINBASE_USD_SYMBOLS[symbol]


def _best_coinbase_base(target_seconds: int) -> tuple[int, int]:
    """Return the largest native granularity (seconds) that fits within target."""
    candidates = sorted(
        [secs for secs in COINBASE_GRANULARITY_MAP if secs <= target_seconds],
        reverse=True,
    )
    if candidates:
        return candidates[0], candidates[0]
    raise ValueError(f"No Coinbase historical base interval can build {target_seconds}s candles")


class CoinbaseExchange(BaseExchange):
    name = "coinbase"

    def get_supported_symbols(self) -> list[str]:
        return list(COINBASE_USD_SYMBOLS.keys())

    async def fetch_historical_candles(
        self, symbol: str, interval: str, limit: int = 500, before: int | None = None
    ) -> list[Candle]:
        interval_config = parse_interval_config(interval)
        target_seconds = interval_config.seconds
        product_id = _normalize_symbol(symbol)

        if target_seconds in NATIVE_COINBASE_SECONDS:
            return await self._fetch_native(product_id, target_seconds, limit, before)
        else:
            best_secs, _ = _best_coinbase_base(target_seconds)
            needed = int((limit * target_seconds) / best_secs) + 10
            base_candles = await self._fetch_native(product_id, best_secs, needed, before)
            aggregated = aggregate_candles(base_candles, target_seconds)
            return aggregated[-limit:]

    async def _fetch_native(
        self, product_id: str, granularity_secs: int, limit: int, before: int | None = None
    ) -> list[Candle]:
        """
        Public Coinbase Exchange REST API.
        GET /products/{id}/candles?granularity={secs}&start={iso}&end={iso}
        Returns [[time, low, high, open, close, volume], ...] newest-first.
        Max 300 candles per request.
        """
        url = f"{COINBASE_REST_URL}/products/{product_id}/candles"
        end_time = before if before is not None else int(time.time())
        remaining = max(limit, 1)
        candles_by_time: dict[int, Candle] = {}

        async with httpx.AsyncClient(timeout=15.0) as client:
            while remaining > 0:
                page_limit = min(remaining, 300)
                start_time = end_time - (page_limit * granularity_secs)

                start_iso = datetime.fromtimestamp(start_time, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                end_iso = datetime.fromtimestamp(end_time, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

                params = {
                    "granularity": str(granularity_secs),
                    "start": start_iso,
                    "end": end_iso,
                }

                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

                if not data:
                    break

                page_earliest = end_time
                for row in data:
                    candle_time = int(row[0])
                    page_earliest = min(page_earliest, candle_time)
                    # row = [time, low, high, open, close, volume]
                    candles_by_time[candle_time] = Candle(
                        time=candle_time,
                        open=float(row[3]),
                        high=float(row[2]),
                        low=float(row[1]),
                        close=float(row[4]),
                        volume=float(row[5]),
                        is_closed=True,
                    )

                fetched_new = len([ts for ts in candles_by_time if start_time <= ts < end_time])
                if fetched_new == 0 or page_earliest >= end_time:
                    break

                remaining = limit - len(candles_by_time)
                end_time = page_earliest

                if remaining > 0:
                    await asyncio.sleep(0.05)

        candles = sorted(candles_by_time.values(), key=lambda x: x.time)
        return candles[-limit:]

    async def subscribe_candles(
        self,
        symbol: str,
        interval: str,
        on_candle: Callable[[Candle], None],
    ) -> asyncio.Task:
        interval_config = parse_interval_config(interval)
        target_seconds = interval_config.seconds
        product_id = _normalize_symbol(symbol)

        task = asyncio.create_task(
            self._stream_from_ticker(product_id, symbol, interval, target_seconds, on_candle)
        )
        return task

    async def _stream_from_ticker(
        self,
        product_id: str,
        norm_symbol: str,
        norm_interval: str,
        target_seconds: int,
        on_candle: Callable[[Candle], None],
    ) -> None:
        """
        Subscribe to Coinbase Exchange public ticker channel.
        Build OHLCV candles from tick stream.
        """
        current_bucket: Optional[Candle] = None
        backoff = 1.0

        while True:
            try:
                logger.info(f"Coinbase WS connecting for {norm_symbol} {norm_interval}")
                async with websockets.connect(
                    COINBASE_WS_URL, ping_interval=20, ping_timeout=10
                ) as ws:
                    subscribe_msg = {
                        "type": "subscribe",
                        "product_ids": [product_id],
                        "channels": ["ticker"],
                    }
                    await ws.send(json.dumps(subscribe_msg))
                    backoff = 1.0
                    logger.info(f"Coinbase WS subscribed ticker: {norm_symbol} {norm_interval}")

                    async for raw in ws:
                        try:
                            msg = json.loads(raw)
                            if msg.get("type") != "ticker":
                                continue

                            price = float(msg.get("price", 0))
                            volume_24h = float(msg.get("volume_24h", 0))
                            tick_time_str = msg.get("time", "")

                            if not price or not tick_time_str:
                                continue

                            try:
                                dt = datetime.fromisoformat(tick_time_str.replace("Z", "+00:00"))
                                tick_ts = int(dt.timestamp())
                            except Exception:
                                tick_ts = int(time.time())

                            bucket_time = (tick_ts // target_seconds) * target_seconds

                            if current_bucket is None or current_bucket.time != bucket_time:
                                if current_bucket is not None:
                                    current_bucket.is_closed = True
                                    on_candle(current_bucket)
                                current_bucket = Candle(
                                    time=bucket_time,
                                    open=price,
                                    high=price,
                                    low=price,
                                    close=price,
                                    volume=0.0,
                                    is_closed=False,
                                )
                            else:
                                current_bucket.high = max(current_bucket.high, price)
                                current_bucket.low = min(current_bucket.low, price)
                                current_bucket.close = price

                            on_candle(current_bucket)

                        except Exception as e:
                            logger.warning(f"Coinbase ticker parse error: {e}")

            except asyncio.CancelledError:
                logger.info(f"Coinbase stream cancelled: {norm_symbol} {norm_interval}")
                return
            except Exception as e:
                logger.error(f"Coinbase WS error: {e}. Reconnecting in {backoff}s")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 60.0)
