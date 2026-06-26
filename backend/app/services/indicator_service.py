"""Orchestrates RSI and derived indicator calculations."""
import logging
from typing import Optional

from app.indicators.rsi import (
    calculate_rsi,
    calculate_rsi_ma,
    calculate_rsi_bollinger_bands,
)
from app.indicators.stoch_rsi import calculate_stoch_rsi
from app.indicators.divergence import detect_rsi_divergence
from app.models.candle import Candle
from app.models.indicator import (
    RsiPoint,
    BollingerBandsPoint,
    StochRsiPoint,
    DivergenceMarker,
    MultiTimeframeRsiEntry,
    RsiResponse,
    RsiAdvancedResponse,
)

logger = logging.getLogger(__name__)


def build_rsi_response(
    candles: list[Candle],
    symbol: str,
    interval: str,
    period: int = 14,
    source: str = "close",
) -> RsiResponse:
    rsi_values = calculate_rsi(candles, period=period, source=source)
    timestamps = [c.time for c in candles]

    rsi_points = [
        RsiPoint(time=timestamps[i], value=rsi_values[i])
        for i in range(len(rsi_values))
    ]

    return RsiResponse(
        symbol=symbol,
        interval=interval,
        period=period,
        source=source,
        rsi=rsi_points,
    )


def build_rsi_advanced_response(
    candles: list[Candle],
    symbol: str,
    interval: str,
    period: int = 14,
    source: str = "close",
    include_sma: bool = False,
    sma_period: int = 14,
    include_ema: bool = False,
    ema_period: int = 14,
    include_wma: bool = False,
    wma_period: int = 14,
    include_stoch_rsi: bool = False,
    include_bb: bool = False,
    include_divergence: bool = False,
    include_mtf: bool = False,
    mtf_candles: Optional[dict[str, list[Candle]]] = None,
) -> RsiAdvancedResponse:
    rsi_values = calculate_rsi(candles, period=period, source=source)
    timestamps = [c.time for c in candles]

    rsi_points = [RsiPoint(time=timestamps[i], value=rsi_values[i]) for i in range(len(rsi_values))]

    sma_points: Optional[list[RsiPoint]] = None
    ema_points: Optional[list[RsiPoint]] = None
    wma_points: Optional[list[RsiPoint]] = None
    bb_points: Optional[list[BollingerBandsPoint]] = None
    stoch_points: Optional[list[StochRsiPoint]] = None
    divergence_markers: Optional[list[DivergenceMarker]] = None
    mtf_entries: Optional[list[MultiTimeframeRsiEntry]] = None

    if include_sma:
        sma_values = calculate_rsi_ma(rsi_values, timestamps, period=sma_period, ma_type="sma")
        sma_points = [RsiPoint(time=timestamps[i], value=sma_values[i]) for i in range(len(sma_values))]

    if include_ema:
        ema_values = calculate_rsi_ma(rsi_values, timestamps, period=ema_period, ma_type="ema")
        ema_points = [RsiPoint(time=timestamps[i], value=ema_values[i]) for i in range(len(ema_values))]

    if include_wma:
        wma_values = calculate_rsi_ma(rsi_values, timestamps, period=wma_period, ma_type="wma")
        wma_points = [RsiPoint(time=timestamps[i], value=wma_values[i]) for i in range(len(wma_values))]

    if include_bb:
        bb_raw = calculate_rsi_bollinger_bands(rsi_values, timestamps)
        bb_points = [
            BollingerBandsPoint(
                time=r["time"],
                upper=r["upper"],
                middle=r["middle"],
                lower=r["lower"],
            )
            for r in bb_raw
        ]

    if include_stoch_rsi:
        stoch_raw = calculate_stoch_rsi(rsi_values, timestamps)
        stoch_points = [
            StochRsiPoint(time=r["time"], k=r["k"], d=r["d"]) for r in stoch_raw
        ]

    if include_divergence:
        div_raw = detect_rsi_divergence(candles, rsi_values)
        divergence_markers = [
            DivergenceMarker(
                time=d["time"],
                type=d["type"],
                price=d["price"],
                rsi_value=d["rsi_value"],
            )
            for d in div_raw
        ]

    if include_mtf and mtf_candles:
        mtf_entries = []
        for tf_interval, tf_candles in mtf_candles.items():
            tf_rsi = calculate_rsi(tf_candles, period=period, source=source)
            last_val = next((v for v in reversed(tf_rsi) if v is not None), None)
            mtf_entries.append(MultiTimeframeRsiEntry(interval=tf_interval, value=last_val))

    return RsiAdvancedResponse(
        symbol=symbol,
        interval=interval,
        period=period,
        source=source,
        rsi=rsi_points,
        sma_rsi=sma_points,
        ema_rsi=ema_points,
        wma_rsi=wma_points,
        bollinger_bands=bb_points,
        stoch_rsi=stoch_points,
        divergences=divergence_markers,
        mtf_rsi=mtf_entries,
    )
