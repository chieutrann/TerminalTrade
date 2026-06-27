import logging
from fastapi import APIRouter, HTTPException, Query, Request

from app.config import (
    DEFAULT_INTERVALS,
    default_interval_configs,
    MAX_CANDLES,
    SUPPORTED_SYMBOLS,
    validate_symbol,
    parse_interval_seconds,
    INTERVAL_PATTERN,
)
from app.models.candle import CandlesResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/symbols")
async def get_symbols():
    return {
        "symbols": SUPPORTED_SYMBOLS,
        "intervals": DEFAULT_INTERVALS,
        "default_intervals": DEFAULT_INTERVALS,
        "interval_configs": default_interval_configs(),
    }


@router.get("/candles", response_model=CandlesResponse)
async def get_candles(
    request: Request,
    symbol: str = Query(..., description="Normalized symbol e.g. BTC/USD"),
    interval: str = Query(..., description="Candle interval e.g. 1m, 5m, 4h"),
    limit: int = Query(500, ge=1, le=MAX_CANDLES),
    before: int | None = Query(None, description="Fetch candles before this unix timestamp (exclusive)"),
) -> CandlesResponse:
    try:
        validate_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not INTERVAL_PATTERN.match(interval):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval format: {interval!r}. Expected pattern: ^[1-9][0-9]*(s|m|h|d)$",
        )

    try:
        parse_interval_seconds(interval)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    manager = request.app.state.exchange_manager
    try:
        candles = await manager.fetch_historical(symbol, interval, limit, before)
    except Exception as e:
        logger.error(f"Error fetching candles for {symbol} {interval}: {e}")
        raise HTTPException(status_code=502, detail=f"Exchange error: {e}")

    return CandlesResponse(symbol=symbol, interval=interval, candles=candles)
