import logging
from fastapi import APIRouter, HTTPException, Query, Request

from app.config import (
    MAX_CANDLES,
    INTERVAL_PATTERN,
    validate_symbol,
    parse_interval_seconds,
)
from app.models.indicator import RsiResponse, RsiAdvancedResponse
from app.services.indicator_service import build_rsi_response, build_rsi_advanced_response

logger = logging.getLogger(__name__)
router = APIRouter()

MTF_INTERVALS = ["5m", "15m", "1h", "4h"]


@router.get("/indicators/rsi", response_model=RsiResponse)
async def get_rsi(
    request: Request,
    symbol: str = Query(...),
    interval: str = Query(...),
    period: int = Query(14, ge=2, le=200),
    source: str = Query("close", pattern="^(close|open|high|low|hl2|hlc3|ohlc4)$"),
    limit: int = Query(500, ge=1, le=MAX_CANDLES),
    before: int | None = Query(None),
) -> RsiResponse:
    try:
        validate_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not INTERVAL_PATTERN.match(interval):
        raise HTTPException(status_code=400, detail=f"Invalid interval: {interval!r}")

    manager = request.app.state.exchange_manager
    try:
        candles = await manager.fetch_historical(symbol, interval, limit + period + 10, before)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return build_rsi_response(candles, symbol, interval, period=period, source=source)


@router.get("/indicators/rsi/advanced", response_model=RsiAdvancedResponse)
async def get_rsi_advanced(
    request: Request,
    symbol: str = Query(...),
    interval: str = Query(...),
    period: int = Query(14, ge=2, le=200),
    source: str = Query("close", pattern="^(close|open|high|low|hl2|hlc3|ohlc4)$"),
    limit: int = Query(500, ge=1, le=MAX_CANDLES),
    include_sma: bool = Query(False),
    sma_period: int = Query(14, ge=2, le=200),
    include_ema: bool = Query(False),
    ema_period: int = Query(14, ge=2, le=200),
    include_wma: bool = Query(False),
    wma_period: int = Query(14, ge=2, le=200),
    include_stoch_rsi: bool = Query(False),
    include_bb: bool = Query(False),
    include_divergence: bool = Query(False),
    include_mtf: bool = Query(False),
    before: int | None = Query(None),
) -> RsiAdvancedResponse:
    try:
        validate_symbol(symbol)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not INTERVAL_PATTERN.match(interval):
        raise HTTPException(status_code=400, detail=f"Invalid interval: {interval!r}")

    manager = request.app.state.exchange_manager
    try:
        overlay_periods = [period]
        if include_sma:
            overlay_periods.append(sma_period)
        if include_ema:
            overlay_periods.append(ema_period)
        if include_wma:
            overlay_periods.append(wma_period)
        if include_stoch_rsi:
            overlay_periods.append(14)
        if include_bb:
            overlay_periods.append(20)
        if include_divergence:
            overlay_periods.append(30)

        warmup = period + max(overlay_periods) + 25
        candles = await manager.fetch_historical(symbol, interval, limit + warmup, before)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    mtf_candles = None
    if include_mtf:
        mtf_candles = {}
        for tf in MTF_INTERVALS:
            if tf != interval:
                try:
                    tf_candles = await manager.fetch_historical(symbol, tf, period + 20, before)
                    mtf_candles[tf] = tf_candles
                except Exception as e:
                    logger.warning(f"MTF fetch failed for {tf}: {e}")

    return build_rsi_advanced_response(
        candles,
        symbol,
        interval,
        period=period,
        source=source,
        include_sma=include_sma,
        sma_period=sma_period,
        include_ema=include_ema,
        ema_period=ema_period,
        include_wma=include_wma,
        wma_period=wma_period,
        include_stoch_rsi=include_stoch_rsi,
        include_bb=include_bb,
        include_divergence=include_divergence,
        include_mtf=include_mtf,
        mtf_candles=mtf_candles,
    )
