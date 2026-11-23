---
name: frontend-developer
description: >-
  Modern Frontend Engineering skill for Next.js 15+ (App Router, React 19) and Svelte 5 (Runes, SvelteKit, Astro)
  with Tailwind CSS v4 and shadcn/ui. Distills Vercel React best practices, Emil Kowalski design engineering,
  URL-driven table/filter state, BFF server actions, and accessibility gates.
  Use when building, refactoring, or reviewing web UI pages, data tables, forms, or client state.
---

# Frontend Developer Skill (Next.js 15, React 19, Svelte 5, Tailwind v4)

Frontend engineering guidelines for **Next.js 15+ (React 19)** and **Svelte 5 (Runes / SvelteKit / Astro)** with **Tailwind CSS v4** and **shadcn/ui**, integrating rules from `vercel-react-best-practices`, `emil-design-eng`, and `taste-skill`.

> **Component hierarchy & styling rules**: Always load and follow [atomic-design](../atomic-design/SKILL.md) (`atoms`, `molecules`, `organisms`, `{module}-{name}` naming, and zero call-site restyling).

---

## 1. URL as Single Source of Truth for View State

- **Every list filter, search query, sort column/direction, pagination cursor/page, date range, and active tab must live in the URL query string** (via `nuqs` in Next.js or `url-state.ts` in SvelteKit).
- Holding filter/tab/sort state only in local `useState` / `$state` breaks page refresh, back/forward navigation, and link sharing.
- **Standard List Screen Shape**:
  - One header row: filter/search bar on the left, primary table actions on the right.
  - Shared `molecules/data-table` configured by `{module}-columns.ts`.
  - Two distinct empty states: **"None created yet"** vs. **"No items match your filters"** (with a one-click "Reset filters" button).

---

## 2. Next.js 15+ & React 19 Best Practices (`vercel-react-best-practices`)

1. **Server Components & BFF Data Access**:
   - Frontend apps never query the database directly. All mutations and authenticated calls go through thin Server Actions (`actions/{feature}.actions.ts`) wrapping the typed API client (`@repo/api-client`).
   - Fetch independent resources in parallel inside Server Components (`Promise.all(...)`) and stream slow secondary sections with `<Suspense>`.
2. **Composition Over Boolean Prop Proliferation**:
   - Avoid adding multiple boolean flags (`isCompact`, `withHeader`, `showFooter`, `isEditing`) to a single component. Expose compound components or explicit variant unions.
3. **React 19 Idioms**:
   - Pass `ref` as a standard prop without `forwardRef`.
   - Avoid unnecessary `useEffect` for derived state — compute derived values during render.

---

## 3. Svelte 5 Runes & SvelteKit Best Practices

- Use **Svelte 5 Runes** exclusively: `$state()`, `$derived()`, `$derived.by()`, `$props()`, and `$bindable()`. Never use legacy Svelte 4 `export let`, `$:`, or `<slot>` (use `{#snippet ...}` and `{@render ...}`).
- Reserve `$effect()` strictly for DOM/browser API synchronization or analytics side effects — never use `$effect()` to synchronize derived state variables.
- **Strict BFF Boundary**: The browser never talks directly to internal backend/AI microservices; SvelteKit server routes (`+page.server.ts`, `+server.ts`, `src/lib/server/`) own cookies, payload encryption, and service hops.

---

## 4. Design Engineering & UI Craft (`emil-design-eng` & `taste-skill`)

- **Tabular Numerals**: Apply `tabular-nums` on all financial amounts, counters, timestamps, and table columns so digits align vertically and never jitter during updates.
- **Interactive Polish & Accessibility**:
  - Every async action button must show a pending indicator and block duplicate clicks without shifting layout width.
  - Ensure full keyboard navigability (`Escape` closes overlays, focus trap inside modals, visible `:focus-visible` rings) and verify with `@axe-core/playwright`.
  - Keep first-load JS budgets under 300 kB gzip per route; lazy-load heavy editors, charts, or canvas engines.
