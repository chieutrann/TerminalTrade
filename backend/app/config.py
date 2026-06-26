import os
import re

SUPPORTED_SYMBOLS = [
    "BTC/USD",
    "BTC/USDT",
    "BTC/USDC",
    "ETH/USD",
    "ETH/USDT",
    "ETH/USDC",
]

DEFAULT_INTERVALS = ["1s", "5s", "15s", "30s", "1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"]

INTERVAL_PATTERN = re.compile(r"^[1-9][0-9]*(s|m|h|d)$")
MIN_INTERVAL_SECONDS = 1
MAX_INTERVAL_SECONDS = 30 * 24 * 3600  # 30 days
MAX_CANDLES = 5000

COINBASE_WS_URL = "wss://ws-feed.exchange.coinbase.com"
COINBASE_REST_URL = "https://api.exchange.coinbase.com"

BINANCE_WS_URL = "wss://stream.binance.com:9443/ws"
BINANCE_REST_URL = "https://api.binance.com"

COINBASE_USD_SYMBOLS = {"BTC/USD": "BTC-USD", "ETH/USD": "ETH-USD"}
BINANCE_SYMBOLS = {
    "BTC/USDT": "BTCUSDT",
    "BTC/USDC": "BTCUSDC",
    "ETH/USDT": "ETHUSDT",
    "ETH/USDC": "ETHUSDC",
}

COINBASE_GRANULARITY_MAP = {
    60: "ONE_MINUTE",
    300: "FIVE_MINUTE",
    900: "FIFTEEN_MINUTE",
    3600: "ONE_HOUR",
    21600: "SIX_HOUR",
    86400: "ONE_DAY",
}

BINANCE_INTERVAL_MAP = {
    60: "1m",
    180: "3m",
    300: "5m",
    900: "15m",
    1800: "30m",
    3600: "1h",
    7200: "2h",
    14400: "4h",
    21600: "6h",
    28800: "8h",
    43200: "12h",
    86400: "1d",
    259200: "3d",
    604800: "1w",
}


def parse_interval_seconds(interval: str) -> int:
    """Convert interval string like '1m', '5s', '4h', '1d' to seconds."""
    m = INTERVAL_PATTERN.match(interval)
    if not m:
        raise ValueError(f"Invalid interval format: {interval!r}")
    value = int(interval[: -1])
    unit = interval[-1]
    multipliers = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    seconds = value * multipliers[unit]
    if seconds < MIN_INTERVAL_SECONDS:
        raise ValueError(f"Interval too small: minimum is {MIN_INTERVAL_SECONDS}s")
    if seconds > MAX_INTERVAL_SECONDS:
        raise ValueError(f"Interval too large: maximum is 30d")
    return seconds


def get_exchange_for_symbol(symbol: str) -> str:
    if symbol in COINBASE_USD_SYMBOLS:
        return "coinbase"
    if symbol in BINANCE_SYMBOLS:
        return "binance"
    raise ValueError(f"Unsupported symbol: {symbol!r}")


def validate_symbol(symbol: str) -> None:
    if symbol not in SUPPORTED_SYMBOLS:
        raise ValueError(f"Unsupported symbol: {symbol!r}. Supported: {SUPPORTED_SYMBOLS}")
