---
name: Chart time-sync disposal (lightweight-charts)
description: How to safely sync two charts' time scales without crashing on disposal
---

## Rule
When syncing two lightweight-charts instances via `subscribeVisibleTimeRangeChange`, always:
1. Store the handler references so they can be unsubscribed on cleanup
2. Wrap `setVisibleRange` calls in try-catch (chart objects throw "Value is null" after removal)

```typescript
const onMainChange = (range) => { if (range) { try { rsiTs.setVisibleRange(range); } catch {} } };
const onRsiChange  = (range) => { if (range) { try { mainTs.setVisibleRange(range); } catch {} } };
mainTs.subscribeVisibleTimeRangeChange(onMainChange);
rsiTs.subscribeVisibleTimeRangeChange(onRsiChange);

// In cleanup:
try { mainTs.unsubscribeVisibleTimeRangeChange(onMainChange); } catch {}
try { rsiTs.unsubscribeVisibleTimeRangeChange(onRsiChange); } catch {}
chart.remove();
```

**Why:** After `chart.remove()`, the time scale object's internals become null; any subscription callback that fires against the removed chart throws "Value is null".
