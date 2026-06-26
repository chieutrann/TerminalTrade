from fastapi import APIRouter, Request
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    exchanges: Optional[dict[str, str]] = None
    active_subscriptions: Optional[int] = None


@router.get("/healthz", response_model=HealthResponse)
async def health_check(request: Request) -> HealthResponse:
    manager = request.app.state.exchange_manager
    status = manager.get_status()
    return HealthResponse(
        status="ok",
        exchanges=status.get("exchanges", {}),
        active_subscriptions=status.get("active_subscriptions", 0),
    )
