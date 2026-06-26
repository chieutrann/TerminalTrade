# TradingView-Style Crypto Charting App

A full-stack TradingView-style crypto charting desktop web app with live candle data, RSI indicators, and real-time WebSocket updates.

## Run & Operate

- Frontend (trading-app): runs via workflow on `$PORT` (Vite dev server)
- Backend (api-server): runs via `python backend/run.py` on port 8080
- `pnpm --filter @workspace/trading-app run typecheck` — typecheck the frontend
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

### Frontend
- React 19 + TypeScript + Vite
- `lightweight-charts` v5 (TradingView) — **v5 API**: use `chart.addSeries(CandlestickSeries, {})` not `chart.addCandlestickSeries()`
- Zustand v5 (with persist middleware)
- TanStack React Query (via `@workspace/api-client-react`)

### Backend
- Python 3.11 + FastAPI + Uvicorn
- WebSockets via `websockets` library
- `httpx` for async HTTP requests
- NumPy for indicator math

## Where things live

- `artifacts/trading-app/` — React frontend
- `artifacts/trading-app/src/components/ChartWidget.tsx` — main chart + RSI panel
- `artifacts/trading-app/src/store/useTradingStore.ts` — Zustand global state
- `artifacts/trading-app/src/hooks/useWebsocket.ts` — WebSocket hook (wss:// aware)
- `backend/app/` — FastAPI backend
- `backend/app/exchanges/coinbase.py` — Coinbase Exchange (public) adapter
- `backend/app/exchanges/binance.py` — Binance adapter
- `backend/app/indicators/` — RSI, Stoch RSI, divergences, MAs
- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/` — generated React Query hooks + Zod schemas

## Architecture decisions

- **Coinbase REST**: uses public `api.exchange.coinbase.com` (no API key). Returns `[time, low, high, open, close, volume]` arrays (oldest-first after sort). Granularity in integer seconds.
- **Coinbase WebSocket**: uses public `ws-feed.exchange.coinbase.com` ticker channel; server builds OHLCV candles from tick stream.
- **Binance**: REST + WebSocket, both public (no API key).
- **lightweight-charts v5**: series creation API changed — always use `chart.addSeries(SeriesClass, options)`.
- **WebSocket URL**: always use `wss://` when the page is served over HTTPS (handled in useWebsocket.ts).
- **Time sync (RSI ↔ main chart)**: subscriptions must be properly unsubscribed on chart cleanup to avoid "Value is null" errors on disposed chart objects.

## Product

- Symbol selector: BTC/USD, ETH/USD (Coinbase), BTC/USDT, ETH/USDT, BTC/USDC, ETH/USDC (Binance)
- Intervals: 1s, 1m, 5m, 15m, 1h, 4h, 1d (and custom)
- RSI (Wilder's method) with: MA overlay, Bollinger Bands, Stoch RSI, divergences, multi-timeframe
- Real-time WebSocket fan-out from backend to all connected clients
- Dark/light theme toggle

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Coinbase public Exchange API max 300 candles per request.
- lightweight-charts v5 `setVisibleRange` throws if called on a disposed chart — always wrap in try-catch.
- Never use `console.log` in server code — use `req.log` or the `logger` singleton.
- The `@workspace/api-client-react` package exports everything from `./generated/api.schemas` at the root — use `import from '@workspace/api-client-react'`, NOT deep paths like `/src/generated/...`.
- pnpm: do not run `pnpm dev` at workspace root; use workflow restart instead.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
