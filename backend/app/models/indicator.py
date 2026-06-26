from typing import Optional
from pydantic import BaseModel


class RsiPoint(BaseModel):
    time: int
    value: Optional[float] = None


class BollingerBandsPoint(BaseModel):
    time: int
    upper: Optional[float] = None
    middle: Optional[float] = None
    lower: Optional[float] = None


class StochRsiPoint(BaseModel):
    time: int
    k: Optional[float] = None
    d: Optional[float] = None


class DivergenceMarker(BaseModel):
    time: int
    type: str
    price: float
    rsi_value: float


class MultiTimeframeRsiEntry(BaseModel):
    interval: str
    value: Optional[float] = None


class RsiResponse(BaseModel):
    symbol: str
    interval: str
    period: int
    source: str
    rsi: list[RsiPoint]


class RsiAdvancedResponse(BaseModel):
    symbol: str
    interval: str
    period: int
    source: str
    rsi: list[RsiPoint]
    sma_rsi: Optional[list[RsiPoint]] = None
    ema_rsi: Optional[list[RsiPoint]] = None
    wma_rsi: Optional[list[RsiPoint]] = None
    bollinger_bands: Optional[list[BollingerBandsPoint]] = None
    stoch_rsi: Optional[list[StochRsiPoint]] = None
    divergences: Optional[list[DivergenceMarker]] = None
    mtf_rsi: Optional[list[MultiTimeframeRsiEntry]] = None
