# Next.js Best Practices

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md) · [REALTIME.md](./REALTIME.md)

This document captures **oewang-specific** Next.js 16 patterns derived from the actual `apps/app` codebase. These are enforced rules, not suggestions.

---

## Next.js 16 Key Behaviors

### Caching is opt-in by default

Unlike Next.js 14, **all routes are dynamic by default**. Nothing is cached unless explicitly opted in.

```ts
// ✅ Use 'use cache' directive to opt into caching
async function getWallets(workspaceId: string) {
  "use cache";
  cacheTag(`wallets:${workspaceId}`);
  return getWalletsAction();
}
```

### `params` and `searchParams` are Promises

```ts
// ✅ CORRECT — always await params
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // ...
}

// ❌ FORBIDDEN — synchronous destructuring
export default async function Page({ params: { locale } }) { ... }
```

### Turbopack is stable and default

Turbopack is the default bundler (configured in `apps/app/next.config.mjs` via `reactCompiler: true`). Do **not** add `--turbopack` flags manually.

### React Compiler is enabled

`reactCompiler: true` is set in `next.config.mjs`. This performs automatic memoization. Do NOT manually add `useMemo`/`useCallback` unless React Compiler cannot handle the case (very rare).

---

## Route Structure

```
apps/app/app/
  (api)/api/auth/
    google/                  — Redirect to Google OAuth
    google/callback/         — Exchange code → JWT, set cookie
    github/                  — Redirect to GitHub OAuth
    github/callback/         — Exchange code → JWT, set cookie
  (main)/[locale]/
    (auth)/                  — Public auth pages (no layout wrapper)
      login/
      register/
      accept-invite/
      create-workspace/
      sync/
    (dashboard)/             — Authenticated app shell (with sidebar layout)
      overview/
      transactions/
      accounts/
      budget/ · debts/ · invoices/ · contacts/ · vault/ · chat/[id]/
      apps/ · calendar/ · notifications/
      settings/              — 12 settings sub-pages
      upgrade/ · payment/
    invoice/[token]/         — Public shareable invoice (no auth required)
```

---

## actions/ — REST Wrappers Only

`actions/` is the **only place** in `apps/app` where HTTP calls are made. One file per feature, named `{feature}.actions.ts`.

```ts
// ✅ CORRECT — thin HTTP wrapper
// apps/app/actions/notification.actions.ts
import { api } from "@/lib/axios"; // the single configured axios instance

export async function getNotifications(page = 1) {
  const { data } = await api.get("/v1/notifications", { params: { page } });
  return data; // axios interceptor already decrypted this
}

export async function markNotificationRead(id: string) {
  const { data } = await api.patch(`/v1/notifications/${id}/read`);
  return data;
}
```

**Rules:**

- Never call `fetch` or `axios` directly outside of `actions/`
- No business logic — these are thin HTTP wrappers only
- Return the full `ApiResponse<T>` — do not unwrap inside the action
- All calls automatically go through `lib/axios.ts` encryption interceptors

**Current action files:** `mayar.actions.ts` · `notification.actions.ts` · `push-subscription.actions.ts`

---

## lib/axios.ts — Critical Single HTTP Client

All HTTP calls in `apps/app` go through this configured Axios instance. It:

1. **Encrypts outgoing request bodies** (sets `x-encrypted: true` header)
2. **Decrypts incoming responses** (handles `x-encrypted: true` response header)
3. **Attaches JWT token** from cookie on every request (`Authorization: Bearer`)
4. **Attaches `x-workspace-id`** header from active workspace

**NEVER call `fetch` directly.** Always import and use `api` from `lib/axios.ts`.

---

## Server Components vs Client Components

- **Server Components** (default) — fetch data, no hooks, no event handlers, no browser APIs
- **Client Components** (`"use client"`) — interactivity, hooks, browser APIs, event handlers
- Keep `"use client"` boundary **as low in the tree as possible**

```tsx
// ✅ CORRECT — client boundary at the interactive leaf
// page.tsx (Server Component — no directive needed)
import { NotificationBell } from "@/components/notification-bell"; // "use client"

export default async function Page() {
  const notifications = await getNotificationsAction();
  return <NotificationBell count={notifications.data?.unread ?? 0} />;
}

// ❌ FORBIDDEN — making an entire page client just for one interactive element
"use client";
export default function Page() { ... }
```

### Passing Server Actions as Props

```tsx
// ✅ Pass server actions as props to client components
// server-component.tsx
import { markRead } from "@/server/server-actions";
import { NotificationList } from "@/components/notification-list"; // "use client"

export default async function Page() {
  const data = await getNotificationsAction();
  return <NotificationList items={data} onMarkRead={markRead} />;
}
```

---

## Parallel Data Fetching

Always fetch independent data in parallel. Never sequential.

```ts
// ✅ CORRECT — parallel
const [wallets, categories, settings] = await Promise.all([
  getWalletsAction(),
  getCategoriesAction(),
  getSettingsAction(),
]);

// ❌ FORBIDDEN — sequential (3x slower)
const wallets = await getWalletsAction();
const categories = await getCategoriesAction();
const settings = await getSettingsAction();
```

---

## Cache Invalidation after Mutations

```ts
"use server";
import { revalidateTag, revalidatePath } from "next/cache";

// After a mutation server action:
revalidateTag(`wallets:${workspaceId}`);
revalidatePath("/accounts");
```

---

## Route Group Conventions

| Route group        | Purpose                                                | Auth required            |
| ------------------ | ------------------------------------------------------ | ------------------------ |
| `(auth)/`          | Login, register, invite acceptance, workspace creation | ❌ No                    |
| `(dashboard)/`     | Main app with sidebar layout                           | ✅ Yes                   |
| `(api)/api/`       | Next.js API routes (Google/GitHub OAuth callbacks)     | N/A                      |
| `invoice/[token]/` | Public shareable invoice view                          | ❌ No (JWT token in URL) |

---

## i18n Rules

All routes live under `[locale]`. Supported locales are configured in `apps/app/i18n-config.ts`.

```ts
// ✅ Load dictionary in server component
import { getDictionary } from "@/get-dictionary";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  return <Component dict={dict} />;
}

// ✅ All user-facing strings come from the dictionary
<button>{dict.common.save}</button>

// ❌ FORBIDDEN — hardcoded strings
<button>Save</button>
```

Dictionary files: `packages/dictionaries/en.json` · `id.json` · `ja.json`

Key format: `namespace.snake_case` → `"wallet.create_success"`, `"common.cancel"`

When adding new strings: **update all three locale files simultaneously**.

---

## Workspace Permissions (Frontend)

```ts
// apps/app/lib/workspace-permissions.ts
// Client-side permission checks for UI rendering

// apps/app/lib/workspace-permissions.server.ts
// Server-side permission checks for Server Components / Server Actions
```

The frontend permission check is for **UI rendering only** (show/hide buttons). The **real** enforcement always happens in `apps/api` via `assertCanEditWorkspaceData()`. Never rely solely on frontend permission checks for security.

---

## Error Boundary Files

| File            | Purpose                     | Notes                  |
| --------------- | --------------------------- | ---------------------- |
| `error.tsx`     | Runtime errors in a segment | Must be `"use client"` |
| `not-found.tsx` | `notFound()` — 404          | Server component       |
| `loading.tsx`   | Suspense fallback skeleton  | Server component       |

Use `notFound()` from `next/navigation` in server components to trigger `not-found.tsx`.

---

## Sentry Integration

Three init files — don't duplicate initialization:

```
apps/app/
  instrumentation.ts        — server-side Sentry init (Node.js instrumentation hook)
  sentry.client.config.ts   — browser Sentry init
  sentry.server.config.ts   — server Sentry config (DSN, source maps)
```

**Never attach to Sentry:** passwords · JWT tokens · decrypted API payloads · encryption keys

---

## Middleware

`apps/app/middleware.ts` handles exactly three concerns:

1. **i18n** — detect locale, redirect to `/{locale}/...`
2. **Auth** — verify JWT from `oewang-session` cookie, redirect to login if invalid
3. **Workspace guard** — redirect to `/create-workspace` if `workspace_id` missing

```ts
// ✅ Lightweight JWT verify only — no DB call, no API call
const payload = verifyJwt(token);
if (!payload?.workspace_id) redirect(`/${locale}/create-workspace`);
```

**Middleware CANNOT:** call `@workspace/database` · make HTTP requests to `apps/api` · import Drizzle or any DB client

---

## proxy.ts

`apps/app/proxy.ts` handles network-level proxying and rewrites. Use this for:

- API route proxying
- Network-level rewrites that don't need auth logic

Do **not** put auth or workspace guard logic in `proxy.ts` — that belongs in `middleware.ts`.

---

## stores/ — Zustand Client State

```ts
// ✅ Zustand for UI state (theme, sidebar, preferences)
// ❌ Zustand is NOT for server data — use React Query / SWR / server components
```

Do not persist sensitive data (tokens, PII) to `localStorage` without encryption. The `preferences-provider.tsx` wraps the store in React context for SSR hydration (prevents theme flash).

---

## Sentry + Console Cleanup

`apps/app/next.config.mjs` removes all `console.*` calls in production builds:

```js
compiler: {
  removeConsole: process.env.NODE_ENV === "production",
},
```

This means `console.log` is fine during development but WILL NOT appear in production. Use `@workspace/logger` only in API/server code — not in Next.js app code.

---

## component/ Organization

```
components/
  auth/           — login-form, register-form, oauth-button
  layout/         — app-sidebar, nav-*, workspace-switcher
  settings/       — organized by sub-domain (profile/, wallet/, category/, ...)
  transactions/   — transaction-form, transaction-list, transaction-item
  vault/          — vault-client
  shared/         — cross-feature shared components
  ui/             — app-specific primitives (not in packages/ui)
```

**Naming:** PascalCase files for React components. No business logic in components.

---

## TanStack Query — Data Fetching Rules

> Full reference: [REALTIME.md](./REALTIME.md)

oewang uses TanStack Query (`@tanstack/react-query`) for all client-side server data. Updates flow from the API via WebSocket events — **not polling**.

### Always Set `staleTime`

```ts
// ✅ CORRECT — prevents refetch on every mount/focus
const { data } = useQuery({
  queryKey: ["wallets"],
  queryFn: getWallets,
  staleTime: 1000 * 60 * 5,   // 5 minutes
  refetchOnWindowFocus: false,
});

// ❌ FORBIDDEN — default staleTime is 0 (always stale)
// Every component mount and every window focus fires a new network request
const { data } = useQuery({
  queryKey: ["wallets"],
  queryFn: getWallets,
});
```

### Standard staleTime Values

| Data type | staleTime |
|---|---|
| User profile, workspace metadata, settings | `1000 * 60 * 60` (1 hour) |
| Wallets, categories (select dropdowns) | `1000 * 60 * 5` (5 min) |
| Transaction / invoice lists | `1000 * 60 * 5` (5 min) |
| Usage metrics (AI quota, vault size) | `1000 * 60 * 5` (5 min) — safety net; primary refresh via WebSocket |

### Polling is Forbidden as the Default

Use WebSocket events (`useRealtime`) instead of `refetchInterval`. Polling is only acceptable when:
- The data source does not support WebSocket notification
- The interval is **≥ 5 minutes**
- `refetchIntervalInBackground: false` is always set

```ts
// ❌ FORBIDDEN
refetchInterval: 15_000,           // too aggressive
refetchIntervalInBackground: true, // wastes resources in background tabs
staleTime: 0,                      // always stale

// ✅ CORRECT — WebSocket-driven
// See REALTIME.md for how to emit and consume events
```

### Shared Component Queries (SelectAccount, SelectCategory)

When a reusable component (dropdown, combobox) uses `useQuery` internally, it **must** set `staleTime` and `refetchOnWindowFocus: false`. Otherwise every row in a data table that renders the component fires a separate network request on mount.

---

## Environment Variables

All env vars are defined in the **root `.env`** file and surfaced via `turbo.json → globalEnv`. Never create `.env` files inside `apps/*` or `packages/*`.

`apps/app/env.ts` validates app-specific vars at build time using Zod.

`NEXT_PUBLIC_` prefix = safe to expose to browser. **Never** put secrets in `NEXT_PUBLIC_` vars.

> See [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md#environment-variables) for the full list.
