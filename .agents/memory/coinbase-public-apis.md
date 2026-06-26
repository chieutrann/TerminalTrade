---
name: Coinbase Public APIs (no auth)
description: Which Coinbase endpoints to use without an API key
---

## Rule
Use `api.exchange.coinbase.com` (legacy Coinbase Pro) for unauthenticated access. Never use `api.coinbase.com/api/v3/brokerage` — that requires an Advanced Trade API key and returns 401.

### REST candles
- URL: `GET https://api.exchange.coinbase.com/products/{product_id}/candles`
- Params: `granularity` (integer seconds: 60, 300, 900, 3600, 21600, 86400), `start`/`end` in ISO 8601
- Response: `[[time, low, high, open, close, volume], ...]` newest-first; sort ascending before use
- Max 300 candles per request

### WebSocket live data
- URL: `wss://ws-feed.exchange.coinbase.com`
- Subscribe: `{"type":"subscribe","product_ids":["BTC-USD"],"channels":["ticker"]}`
- Ticker messages: `{type:"ticker", price, time, product_id, ...}` — build candles from ticks server-side

**Why:** Coinbase Advanced Trade API (`api.coinbase.com/api/v3/brokerage`) requires OAuth/API-key auth since 2024.
