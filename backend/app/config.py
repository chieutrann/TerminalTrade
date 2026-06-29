import os
import re
from dataclasses import dataclass


def _split_env_list(name: str, default: str = "") -> list[str]:
    value = os.environ.get(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

SUPPORTED_SYMBOLS = [
    "BTC/USD",
    "BTC/USDT",
    "BTC/USDC",
    "ETH/USD",
    "ETH/USDT",
    "ETH/USDC",
]

DEFAULT_INTERVALS = ["1s", "3s", "5s", "10s", "15s", "30s", "1m", "3m", "5m", "7m", "15m", "30m", "1h", "2h", "4h", "1d"]

INTERVAL_PATTERN = re.compile(r"^[1-9][0-9]*(s|m|h|d)$")
MIN_INTERVAL_SECONDS = 1
MAX_INTERVAL_SECONDS = 365 * 24 * 3600  # 365 days
MAX_CANDLES = 5000


@dataclass(frozen=True)
class IntervalConfig:
    value: int
    unit: str
    seconds: int
    label: str
    bucket_ms: int

APP_ENV = os.environ.get("APP_ENV", "development").strip().lower()
FRONTEND_ORIGINS = _split_env_list("FRONTEND_ORIGINS")
ALLOWED_HOSTS = _split_env_list("ALLOWED_HOSTS")
CORS_ALLOW_CREDENTIALS = _env_bool("CORS_ALLOW_CREDENTIALS", default=False)

COINBASE_WS_URL = os.environ.get("COINBASE_WS_URL", "wss://ws-feed.exchange.coinbase.com")
COINBASE_REST_URL = os.environ.get("COINBASE_REST_URL", "https://api.exchange.coinbase.com")

BINANCE_WS_URL = os.environ.get("BINANCE_WS_URL", "wss://data-stream.binance.vision/ws")
BINANCE_REST_URL = os.environ.get("BINANCE_REST_URL", "https://data-api.binance.vision")

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
    1: "1s",
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


INTERVAL_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_interval_config(interval: str) -> IntervalConfig:
    """Build a normalized interval config from strings like '3s', '7m', or '2h'."""
    m = INTERVAL_PATTERN.match(interval)
    if not m:
        raise ValueError(f"Invalid interval format: {interval!r}")
    value = int(interval[: -1])
    unit = interval[-1]
    seconds = value * INTERVAL_UNIT_SECONDS[unit]
    if seconds < MIN_INTERVAL_SECONDS:
        raise ValueError(f"Interval too small: minimum is {MIN_INTERVAL_SECONDS}s")
    if seconds > MAX_INTERVAL_SECONDS:
        raise ValueError(f"Interval too large: maximum is 365d")

    return IntervalConfig(
        value=value,
        unit=unit,
        seconds=seconds,
        label=f"{value}{unit}",
        bucket_ms=seconds * 1000,
    )


def parse_interval_seconds(interval: str) -> int:
    """Convert interval string like '3s', '7m', '2h', or '1d' to seconds."""
    return parse_interval_config(interval).seconds


def default_interval_configs() -> list[dict]:
    return [
        {
            "label": config.label,
            "seconds": config.seconds,
            "unit": config.unit,
            "value": config.value,
            "bucket_ms": config.bucket_ms,
        }
        for config in (parse_interval_config(interval) for interval in DEFAULT_INTERVALS)
    ]


def get_exchange_for_symbol(symbol: str) -> str:
    if symbol in COINBASE_USD_SYMBOLS:
        return "coinbase"
    if symbol in BINANCE_SYMBOLS:
        return "binance"
    raise ValueError(f"Unsupported symbol: {symbol!r}")


def validate_symbol(symbol: str) -> None:
    if symbol not in SUPPORTED_SYMBOLS:
        raise ValueError(f"Unsupported symbol: {symbol!r}. Supported: {SUPPORTED_SYMBOLS}")
