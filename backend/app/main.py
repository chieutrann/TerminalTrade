"""FastAPI application entry point."""
import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.routes.health import router as health_router
from app.routes.candles import router as candles_router
from app.routes.indicators import router as indicators_router
from app.routes.websocket import router as ws_router
from app.config import ALLOWED_HOSTS, APP_ENV, CORS_ALLOW_CREDENTIALS, FRONTEND_ORIGINS
from app.services.exchange_manager import ExchangeManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = ExchangeManager()
    app.state.exchange_manager = manager
    logger.info("Trading backend started")
    yield
    logger.info("Trading backend shutting down")


app = FastAPI(
    title="Trading API",
    description="Live crypto charting backend",
    version="1.0.0",
    lifespan=lifespan,
)

if ALLOWED_HOSTS:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=ALLOWED_HOSTS)

cors_origins = FRONTEND_ORIGINS
if not cors_origins and APP_ENV != "production":
    cors_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

PREFIX = "/api"

app.include_router(health_router, prefix=PREFIX)
app.include_router(candles_router, prefix=PREFIX)
app.include_router(indicators_router, prefix=PREFIX)
app.include_router(ws_router, prefix=PREFIX)
app.include_router(ws_router)


@app.get("/")
async def root():
    return {"message": "Trading API — see /api/healthz"}
