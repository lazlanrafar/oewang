---
trigger: always_on
---

# apps/app Architecture Rules

Next.js 16 App Router frontend. UI and REST consumer only. No database access. No business logic.

> See also: [docs/BEST_PRACTICE_NEXT_JS.md](file:///Users/boneconsulting/Developer/oewang/docs/BEST_PRACTICE_NEXT_JS.md) · [docs/STYLE_GUIDE.md](file:///Users/boneconsulting/Developer/oewang/docs/STYLE_GUIDE.md) · [docs/ARCHITECTURE.md](file:///Users/boneconsulting/Developer/oewang/docs/ARCHITECTURE.md)

---

# Core Constraints

```
CANNOT import:              CAN import:
  packages/database           packages/types
  packages/bucket             packages/utils
  apps/api internals          packages/ui
                              packages/constants
                              packages/dictionaries
                                (via get-dictionary.ts only)
                              packages/encryption
                                (axios interceptor only)
```

All data fetching goes through `actions/` → encrypted REST → `apps/api`.

---

# Next.js 16 Key Behaviors

## Caching is opt-in by default
All routes are dynamic by default. Nothing is cached unless explicitly opted in via `"use cache"`:
```ts
async function getWallets(workspace_id: string) {
  "use cache";
  cacheTag(`wallets:${workspace_id}`);
  return getWalletsAction(workspace_id);
}
```

## `params` and `searchParams` are Promises
In Next.js 16, page props are Promises and must be awaited:
```ts
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  ...
}
```

## Turbopack is stable and default
Do not add `--turbopack` flags manually.

## `proxy.ts` replaces some middleware responsibilities
Use `proxy.ts` at the app root for network-level proxying/rewrites. Use `middleware.ts` ONLY for auth, workspace guards, and i18n redirects.

---

# Directory Responsibilities

## `actions/` — REST wrappers only
One file per feature `{feature}.actions.ts`. The ONLY place in `apps/app` where HTTP calls are made.
- Never call `fetch` or `axios` outside of `actions/`
- No business logic — thin HTTP wrappers returning typed `ApiResponse<T>`

## `app/[locale]/` — Pages
- Pages are thin orchestrators. Fetch data in parallel:
  ```ts
  const [wallets, categories] = await Promise.all([getWalletsAction(), getCategoriesAction()]);
  ```
- Cache invalidation after mutations: use `updateTag` inside Server Actions for immediate invalidation, or `revalidateTag` / `revalidatePath` for eventual consistency.

## `components/` — React Components
- Server Components (default): fetch data, no hooks, no event handlers.
- Client Components (`"use client"`): interactivity, hooks, event handlers. Keep the boundary as low in the tree as possible.
- Pass Server Actions as props to Client Components rather than importing them directly.
- Define a `{ComponentName}Props` interface. No business logic.

## `lib/axios.ts` — Critical
The single HTTP client (`api` instance) for all API calls. It automatically handles encryption/decryption, cookie JWT token inclusion, and the `x-workspace-id` header. Never use raw `fetch` or custom `axios`.

## `hooks/` & `stores/`
- `hooks/`: Client-only hooks. Named `use-{purpose}.ts` (kebab-case file, camelCase export).
- `stores/`: Client-only state (Zustand). Do not persist sensitive data without encryption. UI state only.

## `middleware.ts`
Three responsibilities only:
1. i18n locale detection & redirect.
2. Auth verification of JWT from cookie (redirect to `/login` if invalid).
3. Workspace guard (redirect to onboarding if `workspace_id` is missing).
No database calls or HTTP calls to `apps/api` allowed here.

## `server/server-actions.ts`
Next.js `"use server"` functions. Validate inputs, call actions, and return typed responses. Use `updateTag` for immediate cache invalidation.

---

# i18n Rules

All user-facing strings MUST go through the dictionary system. Hardcoded strings are FORBIDDEN.
- Dictionaries: `packages/dictionaries/{locale}.json` (all updated simultaneously).
- Loaded via `get-dictionary.ts` in server components.
- Locale-aware navigation via `hooks/use-localized-route.ts`. Never prepend `/locale` manually.

---

# Error Handling (Next.js 16 conventions)

- `error.tsx`: segment runtime catches (`"use client"` required)
- `not-found.tsx`: rendered by `notFound()`
- `unauthorized.tsx`: 401 (requires `authInterrupts: true` in config)
- `forbidden.tsx`: 403 (requires `authInterrupts: true` in config)
- `loading.tsx`: Suspense fallback for a route segment

---

# Sentry Integration

- `instrumentation.ts` (server), `instrumentation-client.js` (client).
- Never log decrypted payloads or secrets. Scrub PII before sending.

---

# Styling and Design System Rules

Components must implement the styling patterns defined in the style guide:
1. **Design Philosophy**: Minimalist, flat, and typography-focused. Avoid heavy drop shadows or elevations; use clean container borders (`border-border` / `border-[#e6e6e6]`).
2. **Typography pairing**: Use elegant serif headers (`font-serif`) for page greetings and metric values, and sans headers (`font-sans text-[12px] uppercase tracking-widest text-muted-foreground`) for metadata and form labels.
3. **Preset-Aware Styling**: Never hardcode border-radiuses or shadows using Tailwind CSS utility classes like `rounded-xl` or `shadow-lg`. Always use custom variables syntax like `rounded-(--radius)` and `shadow-(--shadow-sm)`.
4. **Layout grids**: Use Canvas layout primitives (`BaseCanvas`, `CanvasHeader`, `CanvasContent`, `CanvasChart`, `CanvasGrid`) to structure dashboard panels.
5. **Interactive UI**: Cards should be flat and flush. Data Tables should feature inline row selections and utilize virtual scrolling list renderers.
