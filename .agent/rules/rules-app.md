---
trigger: always_on
---

# apps/app Architecture Rules

Next.js 16 App Router frontend. UI and REST consumer only. No database access. No business logic.

---

# Core Constraints

```
CANNOT import:              CAN import:
  packages/database           packages/types
  packages/supabase            packages/utils
    (in client components)     packages/ui
  packages/bucket              packages/constants
  apps/api internals           packages/dictionaries
                                 (via get-dictionary.ts only)
                               packages/encryption
                                 (axios interceptor only)
```

All data fetching goes through `actions/` → encrypted REST → `apps/api`.

---

# Next.js 16 Key Behaviors

## Caching is opt-in by default

Unlike Next.js 14, **all routes are dynamic by default** in Next.js 16. Nothing is cached unless explicitly opted in. Use the `use cache` directive to opt specific functions or components into caching:

```ts
// Opt into caching with use cache + cacheTag
import { cacheTag } from "next/cache";

async function getWallets(workspace_id: string) {
  "use cache";
  cacheTag(`wallets:${workspace_id}`);
  const data = await getWalletsAction(workspace_id);
  return data;
}
```

Do **not** rely on implicit caching. Always be explicit.

## `params` and `searchParams` are Promises

In Next.js 16, page props are Promises and must be awaited:

```ts
// CORRECT
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  ...
}

// FORBIDDEN — synchronous destructuring
export default async function Page({ params: { locale } }) { ... }
```

## Turbopack is stable and default

Turbopack is the default bundler. Do not add `--turbopack` flags manually — it is already active. If a dependency is incompatible with Turbopack, configure `serverExternalPackages` in `next.config.ts`.

## `proxy.ts` replaces some middleware responsibilities

Next.js 16 introduces `proxy.ts` as a first-class file convention for network-level proxying. Your project already has `proxy.ts` at the app root. Use `proxy.ts` for proxying/rewriting at the network layer. Use `middleware.ts` only for auth, workspace guard, and i18n redirects (see middleware rules below).

## `instrumentation-client.js`

Next.js 16 adds `instrumentation-client.js` alongside `instrumentation.js`. Use it for client-side observability setup (e.g., Sentry browser init) instead of `sentry.client.config.ts` if migrating to the standard convention. Both approaches are valid; do not duplicate initialization.

---

# Directory Responsibilities

## `actions/` — REST wrappers only

One file per feature. The ONLY place in `apps/app` where HTTP calls are made.

```ts
// actions/wallet.actions.ts
export async function getWallets(page = 1, limit = 20) {
  const { data } = await api.get("/v1/wallets", { params: { page, limit } });
  return data; // axios interceptor already decrypted this
}
```

- Never call `fetch` or `axios` outside of `actions/`
- No business logic — thin HTTP wrappers only
- Return typed `ApiResponse<T>` — do not unwrap inside the action
- Naming: `{feature}.actions.ts`

**Current files:** `auth` · `category` · `setting` · `transaction` · `user` · `vault` · `wallet-group` · `wallet` · `workspace`

---

## `app/[locale]/` — Pages

```
app/[locale]/
  (auth)/         → login, register (public routes)
  (main)/         → authenticated app shell
  layout.tsx      → root layout, locale + auth providers
  not-found.tsx   → 404 page
  forbidden.tsx   → 403 page (new in Next.js 16 with authInterrupts)
  unauthorized.tsx → 401 page (new in Next.js 16 with authInterrupts)
```

- Pages are thin orchestrators — import from `components/`, call `actions/`, pass props down
- Always `await params` before use (it is a Promise in Next.js 16)
- Server components fetch data directly with `async`/`await`
- Wrap slow or non-critical sections in `<Suspense>` with a meaningful `fallback`
- Use `loading.tsx` files for route-level skeleton states
- Use `error.tsx` files for route-level error boundaries (`"use client"` required)
- `[locale]` is always the outermost dynamic segment

### Parallel data fetching

Always fetch independent data in parallel — never sequentially:

```ts
// CORRECT — parallel
const [wallets, categories] = await Promise.all([
  getWalletsAction(),
  getCategoriesAction(),
]);

// FORBIDDEN — sequential (slow)
const wallets = await getWalletsAction();
const categories = await getCategoriesAction();
```

### Cache invalidation after mutations

After a Server Action mutation, use the correct invalidation API:

```ts
"use server";
import { updateTag, revalidateTag, revalidatePath, refresh } from "next/cache";

// Immediate invalidation (read-your-writes) — use inside Server Actions only
updateTag(`wallets:${workspace_id}`);

// Eventual invalidation — acceptable delay
revalidateTag(`wallets:${workspace_id}`);

// Invalidate by path
revalidatePath("/wallets");

// Refresh client router without revalidating tagged data
refresh();
```

---

## `components/` — React Components

```
components/
  auth/         → login-form, register-form, oauth-button
  layout/       → app-sidebar, nav-*, workspace-switcher, ...
  setting/      → organized by sub-domain (profile/, wallet/, category/, ...)
  transactions/ → transaction-form, transaction-list, transaction-item, ...
  vault/        → vault-client
  shared/       → cross-feature shared components
  ui/           → app-specific primitives (currency-input, etc.)
  providers.tsx → root provider tree
```

**Component rendering rules:**

- Server Components (default) — fetch data, no hooks, no event handlers, no browser APIs
- Client Components (`"use client"`) — interactivity, hooks, browser APIs, event handlers
- Keep `"use client"` boundary as low in the tree as possible — do not mark a parent server component as client just for one interactive child
- Pass Server Actions as props to Client Components rather than importing them inside client files
- Always define a `{ComponentName}Props` interface
- No business logic in components

### `"use client"` boundary placement

```tsx
// CORRECT — client boundary at the interactive leaf
// parent-page.tsx (Server Component)
import { LikeButton } from './like-button' // "use client"
export default async function Page() {
  const post = await getPostAction()
  return <LikeButton likes={post.likes} /> // pass data as props
}

// FORBIDDEN — making parent client just for interactivity
"use client" // ← don't do this to a page/layout
export default function Page() { ... }
```

---

## `lib/axios.ts` — Critical

The single HTTP client for all API calls. MUST:

- Encrypt outgoing request bodies via `packages/encryption`
- Decrypt incoming responses (and error responses) in interceptors
- Attach JWT token from cookie on every request
- Attach `x-workspace-id` header from the active workspace

Never call `fetch` directly anywhere in `apps/app` — always use this `api` instance.

---

## `hooks/` — Custom React Hooks

- Client-only hooks only
- May read from stores and call actions on mutation
- Naming: `use-{purpose}.ts` (kebab-case file, camelCase export)
- Never import server-only modules

**Current:** `use-currency.ts` · `use-localized-route.ts`

---

## `stores/` — Client State (Zustand)

- Client-only — never import in server components
- Do not persist sensitive data (tokens, PII) to localStorage without encryption
- Zustand is for UI state (theme, layout, preferences) — server data belongs in React Query / SWR, not Zustand
- `preferences-provider.tsx` wraps the store in React context for SSR hydration

---

## `middleware.ts` — Three responsibilities only

1. **i18n** — detect locale, redirect to `/{locale}/...`
2. **Auth** — verify JWT from cookie, redirect to `/{locale}/login` if invalid
3. **Workspace guard** — redirect to onboarding if `workspace_id` missing from JWT

```ts
// lightweight JWT verify only — no DB call, no API call
const payload = verifyJWT(token);
if (!payload?.workspace_id) redirect(onboarding);
```

**CANNOT:** call `packages/database` · make HTTP requests to `apps/api` · contain business logic · import Drizzle or Supabase admin client

Network-level proxying and rewrites belong in `proxy.ts`, not `middleware.ts`.

---

## `server/server-actions.ts`

Next.js `"use server"` functions for server-to-server calls or server-side mutations.

- All exports must be async functions (Server Functions requirement)
- Validate all inputs before calling actions
- Use `updateTag` for immediate cache invalidation after mutations
- Never expose raw errors to the client — always return typed responses

---

## `navigation/`, `config/`, `types/`, `data/`

- `navigation/sidebar/sidebar-items.ts` — plain config objects only, no React, labels reference dictionary keys
- `config/app-config.ts` — public-safe constants only (no secrets, no API keys)
- `types/` — app-local UI types only; if shared with `apps/api`, move to `packages/types`
- `data/` — static data for UI display, no business logic

---

# i18n Rules

All user-facing strings MUST go through the dictionary system. Hardcoded strings in components are FORBIDDEN.

- Dictionary files: `packages/dictionaries/en.json`, `id.json`, `ja.json`
- Loaded via `get-dictionary.ts` in server components, passed as props to client components
- All locales updated simultaneously when adding new strings
- Key format: `namespace.snake_case` → `"wallet.create_success"`, `"common.cancel"`
- Locale-aware navigation via `hooks/use-localized-route.ts` — never manually prepend `/{locale}`
- Supported locales configured in `i18n-config.ts` only — not hardcoded elsewhere

---

# Error Handling (Next.js 16 conventions)

| File               | Purpose                                                                        |
| ------------------ | ------------------------------------------------------------------------------ |
| `error.tsx`        | Catches runtime errors in a route segment (`"use client"` required)            |
| `not-found.tsx`    | Rendered by `notFound()` — 404                                                 |
| `unauthorized.tsx` | Rendered by `unauthorized()` — 401 (requires `authInterrupts: true` in config) |
| `forbidden.tsx`    | Rendered by `forbidden()` — 403 (requires `authInterrupts: true` in config)    |
| `loading.tsx`      | Suspense fallback for a route segment                                          |

Use `notFound()`, `unauthorized()`, and `forbidden()` from `next/navigation` in server components instead of manual redirects where applicable.

---

# Sentry Integration

```
instrumentation.ts        → server-side Sentry init (Next.js instrumentation hook)
instrumentation-client.js → client-side Sentry init (Next.js 16 convention)
sentry.client.config.ts   → legacy client config (keep until fully migrated)
sentry.server.config.ts   → server Sentry config
```

- Never attach decrypted API payloads, passwords, or JWT tokens to Sentry events
- Use `Sentry.setUser({ id: userId })` only — no raw email/PII without consent

---

# Preferences System (`lib/preferences/`)

- `stores/preferences/preferences-store.ts` is the single runtime source of truth
- Theme applied server-side via cookies (prevents flash), client-side via Zustand
- Never store workspace data or auth tokens in preferences storage

---

# Scripts (`scripts/`)

Build-time / dev-time only — `generate-theme-presets.ts`, `theme-boot.tsx`. Never import from components or actions.
