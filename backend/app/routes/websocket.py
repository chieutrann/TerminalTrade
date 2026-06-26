"""WebSocket endpoint for live candle streaming."""
import asyncio
import json
import logging
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import INTERVAL_PATTERN, validate_symbol, parse_interval_seconds
from app.models.candle import Candle

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/candles")
async def websocket_candles(websocket: WebSocket) -> None:
    await websocket.accept()
    manager = websocket.app.state.exchange_manager

    current_symbol: str | None = None
    current_interval: str | None = None
    candle_queue: asyncio.Queue = asyncio.Queue(maxsize=500)

    def on_candle(candle: Candle) -> None:
        try:
            candle_queue.put_nowait(candle)
        except asyncio.QueueFull:
            pass

    async def send_loop() -> None:
        while True:
            try:
                candle = await asyncio.wait_for(candle_queue.get(), timeout=15.0)
                msg = {
                    "type": "candle",
                    "symbol": current_symbol,
                    "interval": current_interval,
                    "candle": candle.model_dump(),
                }
                await websocket.send_text(json.dumps(msg))
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "ping", "time": int(time.time())}))
                except Exception:
                    return
            except Exception as e:
                logger.warning(f"WS send error: {e}")
                return

    send_task = asyncio.create_task(send_loop())

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))
                continue

            msg_type = data.get("type")

            if msg_type == "subscribe":
                symbol = data.get("symbol", "")
                interval = data.get("interval", "")

                errors = []
                try:
                    validate_symbol(symbol)
                except ValueError as e:
                    errors.append(str(e))

                if not INTERVAL_PATTERN.match(interval):
                    errors.append(f"Invalid interval: {interval!r}")
                else:
                    try:
                        parse_interval_seconds(interval)
                    except ValueError as e:
                        errors.append(str(e))

                if errors:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "; ".join(errors),
                    }))
                    continue

                if current_symbol and current_interval:
                    manager.unsubscribe(current_symbol, current_interval, on_candle)
                    logger.info(f"WS unsubscribed: {current_symbol} {current_interval}")

                while not candle_queue.empty():
                    try:
                        candle_queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break

                current_symbol = symbol
                current_interval = interval

                await manager.subscribe(symbol, interval, on_candle)
                logger.info(f"WS subscribed: {symbol} {interval}")

                await websocket.send_text(json.dumps({
                    "type": "subscribed",
                    "symbol": symbol,
                    "interval": interval,
                }))

            elif msg_type == "unsubscribe":
                if current_symbol and current_interval:
                    manager.unsubscribe(current_symbol, current_interval, on_candle)
                    logger.info(f"WS unsubscribed: {current_symbol} {current_interval}")
                    current_symbol = None
                    current_interval = None

            elif msg_type == "pong":
                pass

            else:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {msg_type!r}",
                }))

    except WebSocketDisconnect:
        logger.info("WS client disconnected")
    except Exception as e:
        logger.error(f"WS error: {e}")
    finally:
        send_task.cancel()
        if current_symbol and current_interval:
            manager.unsubscribe(current_symbol, current_interval, on_candle)
