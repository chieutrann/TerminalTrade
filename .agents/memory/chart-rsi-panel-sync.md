---
name: Chart RSI Panel Time Sync
description: How to keep two lightweight-charts panels in time-sync when one panel has sparse data
---

**Rule:** When syncing two lightweight-charts panels by time range, both must contain the exact same set of timestamps.

**Why:** `setVisibleRange(range)` on the secondary chart only succeeds if the range's `from` and `to` timestamps exist on that chart. If the secondary chart filters out null data points (e.g., RSI hasn't warmed up yet), the missing timestamps mean `setVisibleRange` silently fails and the panel auto-fits to its own data range.

**How to apply:**
- Include `WhitespaceData` entries for null/undefined values instead of filtering them out.
- Import `WhitespaceData` from `lightweight-charts` and use it as `({ time: ts as Time })`.
- Do NOT use `autoSize: false` with explicit `height`/`width` on the secondary chart unless you have a resize observer; prefer `autoSize: true` on both charts.
