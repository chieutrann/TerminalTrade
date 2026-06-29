# FastAPI Cloud Deployment

Use these settings when creating the FastAPI Cloud service:

- Root directory: `backend`
- App import path: `app.main:app`
- Health check path: `/api/healthz`
- Python version: `3.11`

FastAPI Cloud can read the explicit entrypoint from `backend/pyproject.toml`:

```toml
[tool.fastapi]
entrypoint = "app.main:app"
```

If the service is configured from the repository root instead, the root
`pyproject.toml` points FastAPI Cloud at `main:app`, which forwards to the
backend app.

Set these environment variables in FastAPI Cloud:

```env
APP_ENV=production
FRONTEND_ORIGINS=https://your-frontend-domain.com
CORS_ALLOW_CREDENTIALS=false
```

Optional overrides:

```env
ALLOWED_HOSTS=
COINBASE_REST_URL=https://api.exchange.coinbase.com
COINBASE_WS_URL=wss://ws-feed.exchange.coinbase.com
BINANCE_REST_URL=https://data-api.binance.vision
BINANCE_WS_URL=wss://data-stream.binance.vision/ws
```

If the frontend is deployed on a different domain, replace `FRONTEND_ORIGINS`
with that exact origin. For multiple frontend origins, use a comma-separated
list.
