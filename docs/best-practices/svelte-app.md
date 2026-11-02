# Svelte App Best Practices

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Applies to `apps/app`.

How the web app is structured and written. It is a BFF as much as a UI: it holds the session and it is the only client of the API (D5).

## Update this doc when

- Changing the route structure or the data-loading pattern.
- Adopting or dropping a core dependency.
- Changing the i18n mechanism or the money and date rendering rules.

## Stack

| Concern | Choice |
|---|---|
| Framework | SvelteKit 3, `adapter-node`, SSR on |
| Language | Svelte 5 with runes, TypeScript in strict mode |
| Styling | Tailwind CSS v4, CSS-first config |
| Components | shadcn-svelte, generated into the repo, owned by the repo |
| Table | TanStack Table, Svelte adapter |
| Forms | Superforms with a Zod adapter |
| Icons | Lucide Svelte |
| Theme | mode-watcher |
| Fonts | Hedvig Letters Sans and Serif, Geist Mono, self-hosted through `@fontsource` so the CSP stays `font-src 'self'` |
| Crypto | `node:crypto` on the server only ([encryption](../api/encryption.md#primitives)) |
| Tests | Vitest for units, Playwright for journeys |
| Lint | ESLint with the Svelte plugin, Prettier with the Svelte plugin |

Exact versions are pinned at scaffold time. A dependency that runs in the browser is weighed harder than one that runs on the server, because it shares a context with the session ([hardening](../security/hardening.md#dependencies)).

## Route structure

```
src/routes/
├─ (auth)/
│  ├─ login/+page.svelte
│  ├─ register/+page.svelte
│  └─ create-workspace/+page.svelte
├─ (dashboard)/
│  ├─ +layout.server.ts         auth guard, loads user, workspace, wallets, categories
│  ├─ +layout.svelte            sidebar and topbar shell
│  ├─ transactions/+page.svelte
│  ├─ chat/[[id]]/+page.svelte
│  └─ settings/+page.svelte
├─ (dev)/
│  ├─ +layout.server.ts         404 outside `dev`
│  ├─ +layout.svelte            no shell
│  └─ style/+page.svelte        the design system
└─ api/
   └─ chat/stream/+server.ts    SSE passthrough
```

Rules:

- `(dashboard)` is guarded once, in `+layout.server.ts`. No page re-checks the session.
- Shared data the whole shell needs (user, workspace, wallets, categories) loads in the layout, once per navigation.
- A page load fetches only what that page adds.
- Independent fetches go in one `Promise.all`.

## The design system page

`/style` renders every primitive on a bare page: button, input, select,
combobox, checkbox, textarea, label, badge, the colour and type scales, and a
data table with day group rows, in-cell editing and an expanded row.

Two rules make it worth keeping:

- **Development only.** `(dev)/+layout.server.ts` calls `error(404)` outside
  `dev`, so a production deployment does not admit the route exists. Verified
  against a production build, not only by reading the code.
- **It measures itself.** The table at the foot reads the rendered page with
  `getComputedStyle` and prints each value beside the one measured on
  `app.oewang.com` (D50), so a drift shows on the page. Two traps are handled
  in that code: `getPropertyValue` needs kebab-case, and Chrome reports a
  hairline border already snapped to a device pixel, so a 1px rule reads
  0.5556px at a device pixel ratio of 1.8. Compare in device pixels.

## The BFF

The browser never holds a token and never calls the API (D5, AUTH-3, PLT-4).

```
src/lib/server/
├─ api.ts        the API client: attaches the JWT, runs OWE1, returns the envelope
├─ owe1/         handshake, key derivation, seal and open
├─ session.ts    cookie read and write
└─ hooks.ts      helpers for hooks.server.ts
```

- `src/lib/server/` is the only place that imports `node:crypto` or reads the cookie. SvelteKit refuses to bundle it into client code, which makes the boundary a build error rather than a convention.
- One API client. It owns the crypto session, retries once on `CRYPTO_SESSION_UNKNOWN`, and returns the decrypted envelope ([encryption](../api/encryption.md#errors)).
- A component never imports the API client. Data arrives through `load` or through a form action.

### Error mapping

The client returns the envelope. A load or an action maps `error.code` to a dictionary key (UI-1). Nothing renders `error.message` to a user; that field is for logs and developers ([conventions](../api/conventions.md#the-envelope)).

## Svelte 5

- `$state` for local component state, `$derived` for computed values, `$effect` only for genuine side effects such as a subscription or a focus call. An `$effect` that sets state is almost always a `$derived` written wrong.
- `$props()` with a typed interface. No `export let`.
- `$bindable()` only where two-way binding is the clearest option, mostly form inputs.
- Snippets instead of slots.
- Legacy stores only for genuinely global state in `$lib/stores`. Component state is runes.
- `{@html …}` appears in exactly one place, the assistant Markdown renderer, after sanitization (SEC-11). A lint rule enforces that.

## Component organization

```
src/lib/components/
├─ ui/            shadcn-svelte primitives
├─ shared/        page-header, empty-state, money, date-range-picker, confirm-dialog
├─ transactions/  table, form sheet, detail sheet, import wizard, bulk bar
└─ chat/          interface, messages, input, history, tool-call card
```

- `ui/` is generated and edited only to change the design system, never for a feature.
- A component that fetches is a mistake. Data comes in as a prop.
- A component over roughly 300 lines is a hint that a sheet is doing a page's job.

## Forms

Superforms plus Zod, one schema shared between the form and its action.

```ts
export const transactionSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  wallet_id: z.string().min(1),
  to_wallet_id: z.string().nullable(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),   // string, never number (D12)
  date: z.string().datetime({ offset: true }),
}).refine(…);                                       // transfer rules (TXN-7)
```

- Progressive enhancement: every form works without JavaScript. The action is the real path; the client enhancement is the fast path.
- Client validation is usability. The API validates again, and that is the control ([hardening](../security/hardening.md#input-validation)).
- An optimistic update is allowed only where reversal is cheap: the ready flag, a bulk category change. Create and delete wait for the server, because they move wallet balances.

## URL state

Filters, search, sort and page live in URL search parameters (TXN-9), with the same names the API uses ([endpoints](../api/endpoints.md#get-v1transactions-query-parameters)). A shared link reproduces the view.

Per-browser conveniences (column visibility, density, sidebar collapsed) live in `localStorage`, wrapped in try and catch because it throws in a private window. Nothing that must persist reliably goes there.

Never put a secret or a token in an app URL. The proxy is configured not to log query strings for app routes ([encryption](../api/encryption.md#rules-for-urls)).

## i18n

```
src/lib/i18n/
├─ en.json        the single dictionary, nested objects
├─ index.ts       the t() helper
└─ keys.d.ts      generated union of valid dot paths
```

- Every user-facing string resolves through `t("transactions.form.amount_label")` (UI-1).
- A build script generates the key union from `en.json`, so an unknown key is a typecheck error.
- No locale segment in the URL and no negotiation for now (D15). Adding `id.json` later means a file, a store and a switcher, with no change at call sites.
- Error codes from the API map to dictionary keys through one table, so a new code without a string is caught at build time.

## Money and dates

- Money arrives and leaves as a string. It is never parsed into a `number`, not even to compare or sort (D12). A `<Money />` component formats with `Intl.NumberFormat` at render time.
- `<Money />` takes an explicit currency. There is no implicit default, because a wallet balance, a transaction amount and a total can each be in a different currency (D37, UI-5). A missing currency is a typecheck error, not a silent fallback to the workspace's.
- A sort over money happens server-side. A client-side sort over decimal strings would be wrong.
- Dates arrive as ISO 8601 with an offset, render in the workspace timezone, and are never built from a local `Date` without an explicit zone.

## Streaming

`src/routes/api/chat/stream/+server.ts` is a passthrough:

- Read the cookie, attach the JWT, call the API, pipe the response body through unchanged.
- Do not buffer. Do not transform. Do not parse events.
- Set `Cache-Control: no-store` and disable any proxy buffering ([architecture](../architecture.md#chat-stream)).

The chat UI is the only component that parses the event protocol ([AI service](../ai/service.md#streaming-protocol)).

## Accessibility

Treated as part of done, not as a pass at the end (UI-6, UI-7).

- Every interactive element is reachable by keyboard with a visible focus ring.
- A sheet and a dialog trap focus, close on Escape, and return focus to the trigger.
- Every icon-only button has an accessible label from the dictionary.
- Table sort controls are buttons with `aria-sort`.
- Live regions announce a toast and the chat streaming status.
- Colour is never the only carrier of meaning: income and expense also differ by sign and by label.
- Target sizes are at least 44 by 44 CSS pixels on touch.

## Performance

| Rule | Why |
|---|---|
| Keep the `"use client"` equivalent low: push interactivity to leaf components | Less hydration work |
| Load shared data in the layout, not in every page | One fetch per navigation, not four |
| `Promise.all` for independent fetches | Latency adds up in series |
| Paginate at 25, cap at 100 | The table is virtualized only if a measurement says it must be |
| No chart library in the initial bundle | Summary charts are imported dynamically |
| Images: explicit width and height | No layout shift |

Budget: the dashboard's time to first byte under 300 milliseconds, measured against a seeded workspace ([PRD success metrics](../prd.md#7-success-metrics)).

## Testing

| Kind | Scope |
|---|---|
| Vitest | Pure modules: money formatting, the dictionary helper, filter serialization, the OWE1 client against shared vectors |
| Playwright | Three journeys: log in, create a transaction, send a chat message that creates a transaction |
| Accessibility | An axe pass on the three main screens |
| Visual | None for v1. The port is verified in a browser per story instead |

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Architecture](../architecture.md#request-lifecycles)
- [Transactions](../features/transactions.md#ui-port-map) and [chat](../features/chat.md#ui-port-map)
- [API conventions](../api/conventions.md) and [payload encryption](../api/encryption.md)
- [Hardening](../security/hardening.md#browser-headers)
- [Rust API best practices](rust-api.md)
