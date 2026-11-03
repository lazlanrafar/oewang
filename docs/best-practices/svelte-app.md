# Svelte App Best Practices

Status: draft v0.1, 2026-11-02. Part of the [oewang docs](../README.md). Applies to `apps/app`.

How the web app is structured and written. It is a BFF as much as a UI: it holds the session and it is the only client of the API (D5).

## Update this doc when

- Changing the route structure or the data-loading pattern.
- Adopting or dropping a core dependency.
- Changing the i18n mechanism or the money and date rendering rules.
- Changing what the test suites cover or what they need to run.

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
| Theme | mode-watcher, with the before-paint bootstrap in `app.html` so it can carry the CSP nonce ([hardening](../security/hardening.md#browser-headers)) |
| Type scale | Role tokens, not sizes: `text-h1` to `text-h4`, `text-body`, `text-small`, `text-caption`, each carrying line height, weight and letter spacing (D53). `h1`-`h4` take them in the base layer |
| Shape | The old app's: a live radius scale (`--radius: .5rem`) that almost nothing applies, and a shadow scale where only `sm` paints (D66) |
| Focus | None, as the old app has none: `*:focus, *:focus-visible { outline: none !important }` (D66). A known WCAG 2.4.7 failure, recorded in UI-7 |
| Cursor | Anything that answers a click shows the pointer, by role in the base layer rather than per component. Tailwind's preflight gives a button `cursor: default`, and the scaffold gives a menu row the same |
| Contrast | The old app's colours, which leave income at 2.30:1 and expenses at 3.91:1 against a 4.5:1 requirement (D66, UI-7) |
| Motion | Opt-in: one base rule collapses durations under `prefers-reduced-motion: reduce` (D64) |
| Fonts | Hedvig Letters Sans and Serif, Geist Mono, self-hosted through `@fontsource` so the CSP stays `font-src 'self'`. The serif ships one weight (400) and is never set bold: `.font-serif` disables weight synthesis, so a stray `font-semibold` renders unchanged rather than as a faked bold |
| Crypto | `node:crypto` on the server only ([encryption](../api/encryption.md#primitives)) |
| Tests | Vitest for units, Playwright with an axe pass for journeys |
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
│  ├─ chat/[id]/+page.svelte
│  └─ settings/+page.svelte
├─ (dev)/
│  ├─ +layout.server.ts         404 outside `dev`
│  ├─ +layout.svelte            no shell
│  └─ design-system/+page.svelte  every primitive, measured
└─ api/
   └─ chat/stream/+server.ts    opens each sealed event, writes it on
```

Rules:

- `(dashboard)` is guarded once, in `+layout.server.ts`. No page re-checks the session.
- Shared data the whole shell needs (user, workspace, wallets, categories) loads in the layout, once per navigation.
- A page load fetches only what that page adds.
- Independent fetches go in one `Promise.all`.

## The design system page

`/design-system` renders every primitive in `$lib/components/ui` on a bare
page, expanded and grouped into tabs: Foundations (type scale, colour,
shape), Controls (button, badge, checkbox, separator, tabs), Forms (input,
input group, label, textarea, select, combobox), Overlays (command, dropdown
menu, popover, dialog, sheet, toast) and Data (the grouped table with in-cell
editing and an expanded row, plus card).

Two rules make it worth keeping:

- **Development only.** `(dev)/+layout.server.ts` calls `error(404)` outside
  `dev`, so a production deployment does not admit the route exists. Verified
  against a production build, not only by reading the code.
- **It measures itself.** The table at the foot reads the rendered page with
  `getComputedStyle` and prints each value beside the one measured on
  `app.oewang.com` (D50), so a drift shows on the page. A row is read while its
  tab is on screen and keeps its value afterwards, so browsing the tabs fills
  the table in; the two menu rows need the dropdown opened once, then
  Re-measure. Two rows are not comparisons but rules, counted over every
  element the page renders: no radius and no shadow (D52). Two traps are handled
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

Atomic design, the same three layers as the old app's `packages/ui/src/components`, so a component maps one to one onto the file it was ported from (D56).

```
src/lib/components/
├─ atoms/       one element, no product knowledge: button, badge, input, textarea,
│               label, checkbox, radio-group, switch, select, separator, table,
│               tabs, card, avatar, alert, alert-dialog, dialog, sheet, popover,
│               dropdown-menu, command, tooltip, accordion, collapsible, toggle,
│               toggle-group, slider, progress, skeleton, spinner, kbd, breadcrumb,
│               pagination, scroll-area, aspect-ratio, sonner
├─ molecules/   atoms doing one job together: field, input-group, button-group,
│               combobox, currency-input, item, empty, stat-card
├─ organisms/   a whole feature: the transactions table, the chat panel
└─ shell/       this app's own furniture: sidebar nav, workspace switcher, theme toggle
```

- An atom knows nothing about money, workspaces or transactions. The moment it would, it is a molecule.
- `atoms/` and `molecules/` are the design system. They are edited to change the design system, never for one feature's convenience.
- A component that fetches is a mistake. Data comes in as a prop.
- A component over roughly 300 lines is a hint that a sheet is doing a page's job.
- `components.json` points shadcn-svelte's `ui` alias at `atoms/`, so a generated component lands in the right layer. Generated code is then edited to match the old app (square, flat, no ring) before it is used.

### Ported, and not

Ported from `packages/ui`: every atom above, and the molecules above.

Deliberately not ported, because the feature they serve is out of scope ([non-goals](../prd.md#non-goals-for-v1)) or because the platform differs: `chart`, `ai-chart`, `bar-metric-chart`, `donut-chart`, `line-metric-chart` (charts are out of scope), `canvas`, `carousel`, `context-menu`, `menubar`, `navigation-menu`, `resizable`, `drawer`, `hover-card`, `sidebar` (this app has its own shell), `form` (react-hook-form; SvelteKit form actions replace it), `icons` and `simple-icon` (a React icon registry; `@lucide/svelte` replaces it), `portal`, `animated-size-container`, `animated-status`, `text-shimmer`, `input-otp`, `calendar`, `date-range-picker`, `select-country`, `select-currency`, `scrollable-content`, `horizontal-pagination`, and the chat surface (`conversation`, `message`, `markdown`, `prompt-input`, `response`) which lands with M4.

Two rules override fidelity where they conflict: nothing is rounded and nothing casts a shadow (D52). The old avatar, switch, radio, progress track, kbd and menu item are rounded, and its tooltip and alert dialog cast a shadow; the ports are square and flat.

## Sheets

Ported from the old app's `docs/SHEET_GUIDE.md`, which is the contract every sheet follows.

`Sheet.Content` has two layers: a fixed panel carrying `md:p-4`, so the sheet floats 16px off the viewport edges on a desktop, and an inner panel that takes the border, the background and your class. The gap is the look; fighting it with `rounded-none` or a left-only border is what makes a sheet look broken.

Pass `p-0` and manage the padding inside.

**A form sheet** (`transaction-form-sheet`):

- Content `flex h-full flex-col p-0`; header `shrink-0 px-6 pt-6` with no rule; title `text-lg`, no weight or serif override.
- Body `flex-1 overflow-y-auto px-6 pt-6 pb-[100px]`, fields `space-y-6`, two-column rows as `grid grid-cols-2 gap-4`.
- Footer `absolute inset-x-0 bottom-0 bg-background p-6`: one full-width submit, **no cancel**, no rule. The overlay and Escape already close the sheet, and `pb-[100px]` keeps the last field clear of it.
- Labels `text-subtle text-xs font-normal`. Every control keeps its default `h-9`, which is what keeps two fields in a row on the same line.

**A detail sheet** (`transaction-detail-sheet`): header `flex shrink-0 flex-row items-center justify-between border-b bg-muted/5 px-6 py-6`, title `text-xl font-medium`, subtitle `text-subtle text-xs uppercase tracking-widest`, actions in the header row, body `flex-1 space-y-6 overflow-y-auto px-6 py-6`, and no footer.

Two sheets cannot swap in one tick: close the first through its own `Sheet.Close` and open the second once the overlay is gone. When wrapping a control in `Sheet.Close`, call the handler the primitive puts in `props` as well as your own, or the sheet never closes.

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

**Anything that changes what is on screen goes in the query string** (UI-8, D55): filters, search, sort, page, date range, grouping, the open tab. Not component state. A refresh restores the view, the back button undoes the change, and a pasted link reproduces what the sender saw. Parameter names match the API's ([endpoints](../api/endpoints.md#get-v1transactions-query-parameters)).

Use `src/lib/url-state.ts` rather than hand-rolling it:

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { readParam, readText, writeParams } from '$lib/url-state';

	const TABS = ['all', 'income', 'expense'] as const;
	const tab = $derived(readParam(page.url, 'tab', TABS, 'all'));
	const search = $derived(readText(page.url, 'q'));
</script>

<Tabs.Root value={tab} onValueChange={(tab) => writeParams({ tab })} />
<Input value={search} oninput={(e) => writeParams({ q: e.currentTarget.value })} />
```

`readParam` constrains the value to what the page accepts, because a URL is user input and `?tab=nonsense` must not render a tab that does not exist. `writeParams` deletes a parameter given `null` or an empty string, so a cleared filter leaves no `?q=` behind, and replaces the history entry unless `push: true` is passed: a search box should not leave one back-button step per keystroke, while paging should.

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

`src/routes/(dashboard)/chat/stream/+server.ts` carries the turn to the browser:

- Read the cookie, attach the JWT, call the API, write the events on as they arrive.
- Do not buffer, and do not collect. A proxy that waits for the turn to end is a slow request wearing a stream's clothes.
- **Each event is opened and re-emitted, not passed through byte for byte.** Events are sealed one at a time on the hop from the API (D22, [encryption](../api/encryption.md#chat-stream-events)) and the browser holds no key, so this is the hop where they become readable. The sequence number is what makes a dropped or reordered event fail to open, so it is counted here rather than trusted.
- An unsealed event is refused while encryption is on. Accepting one would let an intermediary that strips the sealing write the assistant's words.
- Set `Cache-Control: no-store` and disable any proxy buffering ([architecture](../architecture.md#chat-stream)).
- It answers a `fetch`, not an `EventSource`: the turn carries a body, and `EventSource` can only issue a GET.

The chat UI is the only component that interprets the event protocol ([AI service](../ai/service.md#streaming-protocol)); this route only makes the events legible.

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

| Kind | Scope | Command |
|---|---|---|
| Vitest | Pure modules: money formatting, the dictionary helper, filter serialization, the receipt draft, the import job, the OWE1 client against shared vectors | `bun run test` |
| Playwright | Three journeys: log in, create a transaction, send a chat message that creates a transaction | `bun run test:e2e` |
| Accessibility | An axe pass over the main screens, in the same suite | `bun run test:e2e` |
| Boundary | A walk over the source asserting no browser-reachable file reads `process.env`, imports a Node builtin, fetches an absolute URL, touches `document.cookie` or value-imports `$lib/server` (PLT-4, D5) | `bun run test` |
| Headers | A snapshot of every security header and CSP directive (SEC-15) | `bun run test` |
| Visual | None for v1. The port is verified in a browser per story instead | |

`bun run test` needs nothing running. `bun run test:e2e` needs the whole
stack up and talks to it over HTTP; Playwright starts nothing, because
starting half a stack is how a suite ends up testing a different system
from the one that ships.

Three things about the journey suite, each a decision rather than a detail:

- **It registers its own account.** The seeded `demo@oewang.local` carries
  a placeholder Argon2 hash that verifies against nothing, so its
  documented password is refused. Registering is the better fixture
  anyway: each run gets an empty workspace, so a test can assert "one
  transaction" instead of "one more than before". `E2E_EMAIL` and
  `E2E_PASSWORD` switch it to an existing account for a run against a
  shared environment.
- **An action is retried until it has an effect** (`actUntil`). Every page
  is server rendered and then hydrated, so a control is clickable for a
  moment before its handler exists, and a click in that window is
  swallowed silently. Waiting on a hydration marker would mean depending
  on a SvelteKit internal; retrying depends on nothing.
- **The chat journey needs a model** and runs by default, because a
  journey skipped by default is a journey nobody runs. `E2E_CHAT=0` skips
  it where no model is reachable.

The axe pass disables exactly one rule, `color-contrast`, because the port
reproduces the live app's colours and those fail today (D66, UI-7). The
missing focus ring is the other known failure and axe cannot see it, so it
stays a hand check against UI-7. Everything else is a failure, and the
allowlist is one named rule with one decision behind it, not a threshold.

## Related docs

- [Docs index](../README.md) and [PRD](../prd.md)
- [Architecture](../architecture.md#request-lifecycles)
- [Transactions](../features/transactions.md#ui-port-map) and [chat](../features/chat.md#ui-port-map)
- [API conventions](../api/conventions.md) and [payload encryption](../api/encryption.md)
- [Hardening](../security/hardening.md#browser-headers)
- [Rust API best practices](rust-api.md)
