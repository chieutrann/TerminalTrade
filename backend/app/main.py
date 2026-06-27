"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.config import get_settings
from app.routes.health import router as health_router
from app.routes.candles import router as candles_router
from app.routes.indicators import router as indicators_router
from app.routes.websocket import router as ws_router
from app.services.exchange_manager import ExchangeManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.frontend_origins),
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

if settings.allowed_hosts:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=list(settings.allowed_hosts),
    )

PREFIX = "/api"

app.include_router(health_router, prefix=PREFIX)
app.include_router(candles_router, prefix=PREFIX)
app.include_router(indicators_router, prefix=PREFIX)
app.include_router(ws_router, prefix=PREFIX)


@app.get("/")
async def root():
    return {"message": "Trading API - see /api/healthz"}
