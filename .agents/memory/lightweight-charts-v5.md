---
name: Lightweight Charts v5 API
description: Breaking API changes from v4 to v5 for series creation and disposal
---

## Rule
Use `chart.addSeries(SeriesClass, options)` — never `chart.addCandlestickSeries()` or `chart.addLineSeries()`.

```typescript
import { createChart, CandlestickSeries, LineSeries } from 'lightweight-charts';
const cs = chart.addSeries(CandlestickSeries, { upColor: '#22c55e', ... });
const ls = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 2 });
```

**Why:** v5 removed the convenience methods in favour of a single generic `addSeries` factory.

**How to apply:** Any time lightweight-charts is used in this project, check the import and series creation call.
