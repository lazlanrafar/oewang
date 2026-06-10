# Realtime (WebSocket) System

> See also: [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md) · [BEST_PRACTICE_ELYSIA.md](./BEST_PRACTICE_ELYSIA.md)

oewang uses a **WebSocket-based push system** for real-time UI updates. When a mutation occurs on the API, it broadcasts an event to all connected clients in the same workspace. The client then invalidates the relevant TanStack Query caches — no polling, no `refetchInterval`.

---

## Architecture

```
User action (e.g. creates transaction)
  ↓
apps/api — Service layer mutates DB
  ↓
RealtimeService.notifyValueChange(workspaceId, "event.type")
  ↓
index.ts → app.server.publish(workspaceId, JSON.stringify({ type, timestamp }))
  ↓
WebSocket broadcast to all subscribers of that workspace room
  ↓
apps/app — useRealtime() receives message
  ↓
queryClient.invalidateQueries({ queryKey: [data.type] })
  ↓
TanStack Query refetches → UI updates automatically
```

---

## API Side — Emitting Events

### RealtimeService (`apps/api/modules/realtime/realtime.service.ts`)

```ts
// Emit an event after a successful mutation
RealtimeService.notifyValueChange(workspaceId, "event.type");
```

The `notifyValueChange` call uses an `EventEmitter` internally. The WebSocket handler in `apps/api/index.ts` subscribes to these events and publishes them to all clients in the workspace "room" via Bun's built-in pub/sub.

### WebSocket Server (`apps/api/index.ts`)

```ts
// Clients subscribe to their workspace room on connect
open(ws) {
  ws.subscribe(ws.data.wsAuth.workspaceId);
}

// Events are broadcast from RealtimeService
RealtimeService.onDataChanged(({ workspaceId, type }) => {
  app.server?.publish(
    workspaceId,
    JSON.stringify({ type, timestamp: Date.now() })
  );
});
```

### Authentication

The WebSocket endpoint (`GET /v1/realtime`) requires a valid session:

- **Production** — reads `oewang-session` httpOnly cookie (same-site, sent automatically by the browser)
- **Development** — also accepts `?token=<jwt>` query parameter for testing

---

## Event Type Registry

Use a consistent `noun.verb` or `noun` naming convention.

| Event Type | Emitted By | Triggers Query Invalidation |
|---|---|---|
| `transactions` | `TransactionsService` (create/update/delete) | `["transactions"]`, `["workspace", "active"]` |
| `wallets` | `WalletsService` (create/update/delete) | `["wallets"]`, `["workspace", "active"]` |
| `categories` | `CategoriesService` (create/update/delete) | `["categories"]` |
| `notifications` | `NotificationsService` | `["notifications"]` |
| `workspace.usage` | `AiService` (after token spend), `VaultService` (after upload/delete) | `["workspace", "active"]`, `["ai", "quota"]` |

### Adding a New Event Type

1. Call `RealtimeService.notifyValueChange(workspaceId, "your.event")` in the service after the mutation.
2. Add a handler in `use-realtime.ts` to invalidate the relevant query keys.

```ts
// apps/api/modules/your-feature/your-feature.service.ts
import { RealtimeService } from "../realtime/realtime.service";

// After a successful mutation:
RealtimeService.notifyValueChange(workspaceId, "your-feature");
```

```ts
// apps/app/hooks/use-realtime.ts — add to the onmessage handler
if (data.type === "your-feature") {
  queryClient.invalidateQueries({ queryKey: ["your-feature"] });
}
```

---

## Client Side — Consuming Events

### useRealtime (`apps/app/hooks/use-realtime.ts`)

A singleton hook mounted **once** in the dashboard layout (`apps/app/app/(main)/[locale]/(dashboard)/layout.tsx` via `<RealtimeProvider />`).

It:
- Connects to `wss://<api>/v1/realtime` (or `ws://localhost:<port>/v1/realtime` in dev)
- Parses incoming JSON messages `{ type, timestamp }`
- Calls `queryClient.invalidateQueries` for the matching query key
- Auto-reconnects with exponential backoff (max 30s delay)

```ts
// layout.tsx — only mounted once per dashboard session
<RealtimeProvider />
```

### RealtimeProvider (`apps/app/components/providers/realtime-provider.tsx`)

A thin wrapper component that calls `useRealtime()`. Returns `null` (renders nothing). Exists so `useRealtime` can be used in the server-rendered layout tree as a client leaf.

```tsx
"use client";

import { useRealtime } from "../../hooks/use-realtime";

export function RealtimeProvider() {
  useRealtime();
  return null;
}
```

### Reacting to Specific Events in a Component

If a component needs to respond to a specific WebSocket invalidation (e.g., refresh secondary data after the workspace is updated), subscribe to the TanStack Query cache:

```tsx
// Example: NavUsage refreshes aiQuota whenever workspace.active is re-fetched
useEffect(() => {
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (
      event.type === "updated" &&
      event.query.queryKey[0] === "workspace" &&
      event.query.queryKey[1] === "active" &&
      event.query.state.status === "success" &&
      event.query.state.fetchStatus === "idle" &&
      event.query.state.dataUpdateCount > 1 // skip the initial mount fetch
    ) {
      void fetchAiQuota();
    }
  });
  return unsubscribe;
}, [queryClient]);
```

---

## TanStack Query — Data Freshness Rules

These rules govern how `staleTime`, `refetchOnWindowFocus`, and `refetchInterval` should be set across the app.

### Standard staleTime Values

| Data Type | staleTime | Rationale |
|---|---|---|
| User profile, workspace metadata | `1000 * 60 * 60` (1 hour) | Rarely changes; WebSocket will push changes if needed |
| Transaction settings, sub-currencies | `1000 * 60 * 60` (1 hour) | Settings rarely change mid-session |
| Wallets, categories (in select dropdowns) | `1000 * 60 * 5` (5 min) | Shared dropdowns; invalidated by WS on mutation |
| Transaction list, invoice list | `1000 * 60 * 5` (5 min) | Invalidated by WS on mutation |
| Usage metrics (workspace, AI quota) | `1000 * 60 * 5` (5 min) | Safety net; primary refresh via `workspace.usage` WS event |

### Rules

```ts
// ✅ CORRECT — always set staleTime on shared/reusable queries
const { data } = useQuery({
  queryKey: ["wallets"],
  queryFn: getWallets,
  staleTime: 1000 * 60 * 5,
  refetchOnWindowFocus: false,
});

// ❌ FORBIDDEN — no staleTime means default 0 (always stale)
// Every mount of a component using this query fires a fresh fetch
const { data } = useQuery({
  queryKey: ["wallets"],
  queryFn: getWallets,
  // missing staleTime → fires on every mount/focus
});
```

### Polling — When It Is Allowed

`refetchInterval` (polling) is **not the default** approach. Use WebSocket events instead. Polling is only acceptable when:

1. The data source does not support WebSocket notification (external API, no control over mutation side)
2. The poll interval is **≥ 5 minutes** for non-critical background data
3. `refetchIntervalInBackground: false` is always set (do not burn resources in background tabs)

```ts
// ❌ FORBIDDEN — aggressive polling
const { data } = useQuery({
  queryKey: ["workspace", "active"],
  queryFn: getActiveWorkspace,
  refetchInterval: 15_000,           // every 15 seconds — too aggressive
  refetchIntervalInBackground: true, // also polls when tab is hidden
  staleTime: 0,                      // always stale
});

// ✅ CORRECT — WebSocket-driven with safety-net staleTime
const { data } = useQuery({
  queryKey: ["workspace", "active"],
  queryFn: getActiveWorkspace,
  staleTime: 1000 * 60 * 5,   // 5 min safety net
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});
// Updates are pushed via "workspace.usage" WebSocket event
```

---

## Reconnection & Reliability

The `useRealtime` hook implements exponential backoff reconnection:

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
...
Max delay: 30s
```

On reconnection, the client re-subscribes to the workspace room. Any data that changed while disconnected will not be pushed retroactively — the safety-net `staleTime` ensures a background refresh within 5 minutes if the WebSocket was down.

For critical mutations (e.g. transaction creation), the optimistic update pattern in `TransactionFormSheet` ensures the UI is updated immediately in the local cache without needing a WebSocket round-trip.

---

## Development Notes

- WebSocket connections appear in the API log as: `[WS] Client connected and subscribed to workspace: <id>`
- Disconnect/reconnect cycles are visible as `[WS] Client disconnected` followed immediately by `[WS] Client connected`
- This reconnect loop in development is **normal behavior** caused by Next.js HMR (hot module reload) tearing down and remounting the client component tree
- In production, connections are stable and reconnects only happen on true network drops

### Testing WebSocket Events Manually

```bash
# Using wscat (npm i -g wscat)
wscat -c "ws://localhost:3002/v1/realtime?token=<your-jwt>"

# Server will log:
# [WS] Authenticated connection from unknown (User: <user-id>)
# [WS] Client connected and subscribed to workspace: <workspace-id>

# Send a ping:
> ping
< pong
```
