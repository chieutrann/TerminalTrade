"""
Exchange manager — maintains one upstream WS per (symbol, interval),
fans out candle updates to all subscribed frontend clients.
"""
import asyncio
import logging
from typing import Callable

from app.exchanges.base import BaseExchange
from app.exchanges.binance import BinanceExchange
from app.exchanges.coinbase import CoinbaseExchange
from app.models.candle import Candle
from app.services.candle_cache import CandleCache

logger = logging.getLogger(__name__)


class ExchangeManager:
    def __init__(self) -> None:
        self._exchanges: dict[str, BaseExchange] = {
            "coinbase": CoinbaseExchange(),
            "binance": BinanceExchange(),
        }
        self._cache = CandleCache()
        # (symbol, interval) -> list of frontend callbacks
        self._subscribers: dict[tuple[str, str], list[Callable[[Candle], None]]] = {}
        # (symbol, interval) -> upstream stream task
        self._stream_tasks: dict[tuple[str, str], asyncio.Task] = {}
        # Exchange connection health
        self._exchange_status: dict[str, str] = {
            "coinbase": "connecting",
            "binance": "connecting",
        }

    def _get_exchange(self, symbol: str) -> BaseExchange:
        from app.config import get_exchange_for_symbol
        name = get_exchange_for_symbol(symbol)
        return self._exchanges[name]

    def get_exchange_name(self, symbol: str) -> str:
        from app.config import get_exchange_for_symbol
        return get_exchange_for_symbol(symbol)

    def get_status(self) -> dict:
        return {
            "exchanges": dict(self._exchange_status),
            "active_subscriptions": len(self._stream_tasks),
        }

    async def fetch_historical(
        self, symbol: str, interval: str, limit: int = 500, before: int | None = None
    ) -> list[Candle]:
        exchange = self._get_exchange(symbol)
        exchange_name = self.get_exchange_name(symbol)

        try:
            candles = await exchange.fetch_historical_candles(symbol, interval, limit, before)
            if not before:
                self._cache.seed(symbol, interval, candles)
            else:
                for c in candles:
                    self._cache.upsert(symbol, interval, c)
            self._exchange_status[exchange_name] = "connected"
            return candles
        except Exception as e:
            self._exchange_status[exchange_name] = "error"
            logger.error(f"Failed to fetch historical for {symbol} {interval}: {e}")
            raise

    async def subscribe(
        self,
        symbol: str,
        interval: str,
        on_candle: Callable[[Candle], None],
    ) -> None:
        """Subscribe a frontend client to a (symbol, interval) stream."""
        key = (symbol, interval)

        if key not in self._subscribers:
            self._subscribers[key] = []
        self._subscribers[key].append(on_candle)

        if key not in self._stream_tasks or self._stream_tasks[key].done():
            await self._start_stream(symbol, interval)

    async def _start_stream(self, symbol: str, interval: str) -> None:
        key = (symbol, interval)
        exchange = self._get_exchange(symbol)
        exchange_name = self.get_exchange_name(symbol)

        def fan_out(candle: Candle) -> None:
            self._cache.upsert(symbol, interval, candle)
            self._exchange_status[exchange_name] = "connected"
            callbacks = self._subscribers.get(key, [])
            dead = []
            for cb in callbacks:
                try:
                    cb(candle)
                except Exception as e:
                    logger.warning(f"Subscriber callback error: {e}")
                    dead.append(cb)
            for d in dead:
                try:
                    callbacks.remove(d)
                except ValueError:
                    pass

        task = await exchange.subscribe_candles(symbol, interval, fan_out)
        self._stream_tasks[key] = task
        logger.info(f"Started upstream stream: {symbol} {interval}")

    def unsubscribe(
        self,
        symbol: str,
        interval: str,
        on_candle: Callable[[Candle], None],
    ) -> None:
        key = (symbol, interval)
        subs = self._subscribers.get(key, [])
        try:
            subs.remove(on_candle)
        except ValueError:
            pass

        if not subs and key in self._stream_tasks:
            task = self._stream_tasks.pop(key)
            task.cancel()
            logger.info(f"Stopped upstream stream (no subscribers): {symbol} {interval}")

    def get_cached_candles(self, symbol: str, interval: str, limit: int) -> list[Candle]:
        return self._cache.get_recent(symbol, interval, limit)

    def supported_symbols(self) -> list[str]:
        symbols = []
        for exchange in self._exchanges.values():
            symbols.extend(exchange.get_supported_symbols())
        return symbols
