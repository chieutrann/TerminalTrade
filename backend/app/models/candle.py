from typing import Optional
from pydantic import BaseModel


class Candle(BaseModel):
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    is_closed: Optional[bool] = None


class CandlesResponse(BaseModel):
    symbol: str
    interval: str
    candles: list[Candle]


class WebSocketSubscribeMessage(BaseModel):
    type: str
    symbol: str
    interval: str


class WebSocketCandleMessage(BaseModel):
    type: str = "candle"
    symbol: str
    interval: str
    candle: Candle
