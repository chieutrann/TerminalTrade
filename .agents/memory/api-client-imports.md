---
name: API client import paths
description: Always import from the package root, never deep paths
---

## Rule
Import from `@workspace/api-client-react` (root), never from deep subpaths like `@workspace/api-client-react/src/generated/api.schemas`.

```typescript
// CORRECT
import type { Candle } from '@workspace/api-client-react';
import { useGetCandles, getGetCandlesQueryKey } from '@workspace/api-client-react';

// WRONG — breaks module resolution, causes "Invalid hook call" cascades
import type { Candle } from '@workspace/api-client-react/src/generated/api.schemas';
```

**Why:** The package only exposes its root barrel export. Deep paths are not listed as subpath exports in `package.json`, so bundlers (Vite/esbuild) fail to resolve them, which corrupts the module graph and causes unrelated React hook errors downstream.
