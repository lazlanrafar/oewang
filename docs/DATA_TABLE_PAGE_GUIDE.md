# Data Table Page Guide

This document defines the standard pattern for any list/data-table page in `apps/app`.
The transactions page (`/transactions`) is the reference implementation — follow this structure for any new page that lists workspace records.

> Related docs: [STYLE_GUIDE.md](./STYLE_GUIDE.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md) · [SHEET_GUIDE.md](./SHEET_GUIDE.md)

---

## File Structure

For a feature `foo` (e.g. `transactions`, `contacts`, `wallets`), create:

```
apps/app/
  app/(main)/[locale]/(dashboard)/foo/
    page.tsx                                     ← Server component — fetches initial data
  components/organisms/foo/
    foo-client.tsx                               ← Main client component — query, state, DataTable
    foo-client-header.tsx                        ← Toolbar (filters, date picker, actions)
    foo-client-cards.tsx                         ← (optional) Summary cards above the toolbar
    foo-columns.tsx                              ← TanStack column definitions with skeleton meta
    foo-form-sheet.tsx                           ← (optional) Create/edit sheet
    foo-detail-sheet.tsx                         ← (optional) Detail view sheet
```

The two non-negotiable pieces are `page.tsx` (server) and `foo-client.tsx` (client). The header file is required only when the toolbar has more than ~3 controls — otherwise inline it. The cards file is required when the page displays summary metrics above the table (e.g. accounts has Total Balance / Accounts / Active).

---

## 1. The Server Page (`page.tsx`)

The page is **`async`**, **`force-dynamic`**, and fetches everything the client needs in **parallel** via `Promise.all`. It renders **no skeleton fallback** — the page does not return HTML until data is ready, then ships a fully-rendered table.

```tsx
import type { Dictionary } from "@workspace/dictionaries";
import { getFoo, /* getRelated... */ } from "@workspace/modules/server";
import type { Foo } from "@workspace/types";
import type { Metadata } from "next";

import { FooClient } from "@/components/organisms/foo/foo-client";
import { getDictionary } from "@/get-dictionary";
import type { Locale } from "@/i18n-config";

export const metadata: Metadata = { title: "Foo" };
export const dynamic = "force-dynamic";

const PAGE_LIMIT = 20;

export default async function FooPage(props: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const limit = Number(searchParams.limit) || PAGE_LIMIT;

  let initialData: Foo[] = [];
  let rowCount = 0;
  let dictData: Dictionary | null = null;

  try {
    const [fooRes, dict] = await Promise.all([
      getFoo({ page, limit } as Parameters<typeof getFoo>[0]),
      getDictionary(locale),
    ]);
    dictData = dict;
    if (fooRes?.success && fooRes?.data) {
      initialData = fooRes.data;
      rowCount = fooRes.meta?.pagination?.total ?? 0;
    }
  } catch (error) {
    console.error("Failed to fetch foo page data:", error);
  }

  return (
    <div className="no-scrollbar flex h-[calc(100dvh-5rem)] flex-col bg-background md:h-[calc(100dvh-6rem)]">
      <div className="no-scrollbar min-h-0 flex-1">
        <FooClient
          initialData={initialData}
          rowCount={rowCount}
          pageCount={Math.ceil(rowCount / limit)}
          initialPage={page - 1}
          pageSize={limit}
          dictionary={dictData as Dictionary}
        />
      </div>
    </div>
  );
}
```

### Rules
- **No `Suspense`, no `Hydrated`, no skeleton fallback in the page.** The full page is rendered on the server before HTML is sent — initial paint already shows the table.
- **`force-dynamic`** is required because workspace data is per-user.
- **Parallel fetches** via `Promise.all` — never await sequentially.
- All data fetching goes through `@workspace/modules/server` actions (see [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md)).
- Outer container uses fixed height (`h-[calc(100dvh-5rem)]`) so the table scroll area can take `flex-1`.

---

## 2. The Client Header (`foo-client-header.tsx`)

A pure presentational component that receives state + callbacks. It contains the search filter, date picker, columns visibility menu, and primary actions.

```tsx
"use client";

import type { ComponentProps } from "react";
import type { Dictionary } from "@workspace/dictionaries";
import {
  Button,
  DataTableColumnsVisibility,
  DataTableFilter,
  DateRangePicker,
} from "@workspace/ui";
import { Plus } from "lucide-react";

interface FooClientHeaderProps {
  filters: { /* ... */ };
  onFilterChange: (filters: FooClientHeaderProps["filters"]) => void;
  columns: ComponentProps<typeof DataTableColumnsVisibility>["columns"];
  onAdd: () => void;
  canEditData: boolean;
  dictionary: Dictionary;
}

export function FooClientHeader({
  filters,
  onFilterChange,
  columns,
  onAdd,
  canEditData,
  dictionary,
}: FooClientHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <div className="flex flex-1 items-center">
        <DataTableFilter
          filters={filters}
          onFilterChange={onFilterChange}
          placeholder={dictionary.foo.search_placeholder}
          className="w-full border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>

      <div className="flex items-center gap-2">
        <DataTableColumnsVisibility columns={columns} />
        {canEditData && (
          <Button variant="default" className="gap-1" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            {dictionary.foo.add_button}
          </Button>
        )}
      </div>
    </div>
  );
}
```

### Rules
- **`"use client"`** at the top.
- **Receives all state via props** — never reads from a store directly. This keeps the header reusable and easy to test.
- Filter input uses `DataTableFilter` from `@workspace/ui` for consistent styling and behavior.
- The header **never** shows a skeleton — it stays interactive even while the table body is loading.

---

## 3. The Main Client (`foo-client.tsx`)

Manages the data query, table state, row selection, and loading skeleton. The header is composed in here; the table is rendered with `DataTable`.

```tsx
"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { Dictionary } from "@workspace/dictionaries";
import { getFoo } from "@workspace/modules/foo/foo.action";
import type { Foo } from "@workspace/types";
import {
  DataTable,
  DataTableColumnsVisibility,
  DataTableEmptyState,
  TableSkeleton,
} from "@workspace/ui";

import { FooClientHeader } from "./foo-client-header";
import { fooColumns } from "./foo-columns";

interface FooClientProps {
  initialData: Foo[];
  rowCount: number;
  pageCount: number;
  initialPage: number;
  pageSize: number;
  dictionary: Dictionary;
}

export function FooClient({
  initialData,
  rowCount,
  pageCount,
  initialPage,
  pageSize,
  dictionary,
}: FooClientProps) {
  const [columns, setColumns] = useState<ComponentProps<typeof DataTableColumnsVisibility>["columns"]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({ q: "" /* ... */ });
  const [mountFilters] = useState(filters);

  // Match initial query key so SSR data is reused without a refetch.
  const isInitial = useMemo(
    () => JSON.stringify(filters) === JSON.stringify(mountFilters),
    [filters, mountFilters],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["foo", filters],
    queryFn: async ({ pageParam = 1 }) =>
      getFoo({ page: pageParam, limit: pageSize, ...filters }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const p = lastPage.meta?.pagination;
      return p && p.page < p.total_pages ? p.page + 1 : undefined;
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    initialData: isInitial
      ? {
          pages: [{
            success: true,
            data: initialData,
            meta: {
              pagination: { total: rowCount, page: initialPage + 1, limit: pageSize, total_pages: pageCount },
              timestamp: Date.now(),
            },
          }],
          pageParams: [1],
        }
      : undefined,
  });

  const rows = useMemo(
    () => data?.pages?.flatMap((p) => p.data ?? []).filter(Boolean) ?? [],
    [data],
  );

  const columnsWithActions = useMemo(
    () => fooColumns(dictionary) as ColumnDef<Foo>[],
    [dictionary],
  );

  if (!dictionary) return null;

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <FooClientHeader
        filters={filters}
        onFilterChange={setFilters}
        columns={columns}
        onAdd={() => { /* open create sheet */ }}
        canEditData={true}
        dictionary={dictionary}
      />

      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <TableSkeleton
            columns={columnsWithActions}
            rowCount={20}
            stickyColumnIds={["select", "name", "actions"]}
            actionsColumnId="actions"
          />
        ) : (
          <DataTable<Foo>
            data={rows}
            columns={columnsWithActions}
            setColumns={setColumns}
            tableId="foo"
            externalScrollContainerRef={containerRef}
            sticky={{ columns: ["select", "name", "actions"], startFromColumn: 0 }}
            emptyMessage={
              <DataTableEmptyState
                title={dictionary.foo.empty.title}
                description={dictionary.foo.empty.description}
              />
            }
            infiniteScroll
            fetchNextPage={fetchNextPage}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            hFull
          />
        )}
      </div>
    </div>
  );
}
```

### Rules
- **`isLoading` from `useInfiniteQuery`** controls the skeleton — it is `false` on first paint (because `initialData` is hydrated from SSR), and only becomes `true` when filters change (query key changes, no matching cache).
- **Header is always mounted** — the `isLoading ? <TableSkeleton /> : <DataTable />` ternary lives inside the table container only.
- **`isInitial` check** ensures the SSR `initialData` is reused for the first render but not for subsequent filter changes.
- **`tableId`** must be unique per page — it's used as the cookie key for table settings (column order, sizing, visibility).
- The sticky columns array must include all columns the user shouldn't be able to scroll past — typically `select`, the primary identifier column, and `actions`.

---

## 4. Summary Cards (`foo-client-cards.tsx`)

Pages that show summary metrics above the table (totals, counts, statuses) should use the `DataTablePageCard` component from `@workspace/ui`. It handles the layout, label styling, and an **animated counter** for numeric values — same UX as the overview page.

```tsx
"use client";

import type { Dictionary } from "@workspace/dictionaries";
import { DataTablePageCard } from "@workspace/ui";

interface FooClientCardsProps {
  totalBalance: number;
  accountCount: number;
  activeCount: number;
  isLoading: boolean;
  formatCurrency: (v: number, opts?: { locale?: string }) => string;
  locale: string;
  dictionary: Dictionary;
}

export function FooClientCards({
  totalBalance,
  accountCount,
  activeCount,
  isLoading,
  formatCurrency,
  locale,
  dictionary,
}: FooClientCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <DataTablePageCard
        label={dictionary.foo.total_balance}
        value={totalBalance}
        isLoading={isLoading}
        formatter={(v) => formatCurrency(v, { locale })}
      />
      <DataTablePageCard
        label={dictionary.foo.count}
        value={accountCount}
        isLoading={isLoading}
      />
      <DataTablePageCard
        label={dictionary.foo.active}
        value={activeCount}
        isLoading={isLoading}
        valueClassName="text-emerald-600 dark:text-emerald-400"
      />
    </div>
  );
}
```

### `DataTablePageCard` props

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Small uppercase label above the value |
| `value` | `number \| string` | **Numbers animate from 0** with a counter on mount. Strings render as-is |
| `isLoading` | `boolean` | When true, **only the value** is replaced by a Skeleton — the label stays visible |
| `formatter` | `(v: number) => string` | Optional formatter for number values (e.g. `formatCurrency`) |
| `valueClassName` | `string` | Optional class on the value text (e.g. color override) |
| `className` | `string` | Optional class on the card container |
| `action` | `ReactNode` | Optional element rendered in the top-right (icon, badge, button) |

### Loading rule for cards

- The **label always shows** — no skeleton on labels
- The **value** shows a `Skeleton` block when `isLoading` is true
- For **numeric values**, when loading completes the number animates from 0 to its target using framer-motion (same `CountUp` pattern as overview cards)
- For **string values**, the value appears immediately when loading completes — no animation

The cards block is placed **above** the toolbar in `foo-client.tsx`:

```tsx
<div className="flex h-full w-full flex-col space-y-4">
  <FooClientCards {...cardsProps} isLoading={isLoading} />
  <FooClientHeader {...headerProps} />
  <div className="relative min-h-0 flex-1">
    {isLoading ? <TableSkeleton ... /> : <DataTable ... />}
  </div>
</div>
```

The same `isLoading` from `useInfiniteQuery` drives both cards and the table — they show their respective loading states in sync.

---

## 5. The Skeleton (`TableSkeleton`)

`TableSkeleton` is exported from `@workspace/ui` and reads from the same column definitions as `DataTable`. It renders adaptive skeleton cells based on each column's `meta.skeleton` config.

```tsx
<TableSkeleton
  columns={columnsWithActions}        // Same column defs as DataTable
  rowCount={20}                        // Default: 40 — match your initial page size
  stickyColumnIds={["select", "name", "actions"]}
  actionsColumnId="actions"            // Default: "actions"
/>
```

### Column Skeleton Config

In `foo-columns.tsx`, set `meta.skeleton` on each column to control how its skeleton cell renders:

```ts
{
  id: "name",
  header: "Name",
  size: 320,
  minSize: 200,
  maxSize: 600,
  meta: {
    skeleton: { type: "text", width: "w-32" },   // shimmer bar 128px wide
  },
}
```

Available `meta.skeleton.type` values:
- `"checkbox"` — 4×4 square (use on the select column)
- `"text"` — horizontal bar; pair with `width: "w-24"` etc.
- `"avatar-text"` — circle + bar (use for user/contact columns)
- `"icon-text"` — small square + bar (use for category/status with icon)
- `"badge"` — pill-shaped bar
- `"tags"` — two small pills side-by-side
- `"icon"` — 5×5 square (use for actions, status indicators)

Columns without `meta.skeleton` fall back to a default `Skeleton h-3.5 w-24` cell.

---

## Loading Behavior Summary

| Phase | Cards | Header | Table body |
| --- | --- | --- | --- |
| **Initial server render** | Numbers animate from 0 on first paint | Interactive | Real data |
| **First client paint** | Numbers animate from 0 (`isLoading = false`) | Interactive | Real data |
| **Filter change** | Card values show Skeleton; labels stay | Interactive | `TableSkeleton` |
| **Infinite scroll** | Card values stay visible | Interactive | Visible rows stay + spinner at bottom |
| **Mutation (delete/edit)** | Optimistic update — number re-animates to new value | Interactive | Optimistic row change |

---

## Common Pitfalls

- **Do not** add `Suspense` around the client component in `page.tsx`. The page is already async and waits for data — adding `Suspense` causes a blank flash on slow connections.
- **Do not** put the `isLoading` ternary outside the table container. The header and cards must stay rendered.
- **Do not** rebuild the skeleton manually in `page.tsx`. Always use `TableSkeleton` so it stays in sync with the real table layout.
- **Do not** wrap labels in `Skeleton` when cards are loading. Only the value should show a Skeleton — labels are static and known at render time.
- **Do not** use a plain `<span>{value}</span>` for numeric card values. Use `DataTablePageCard` so the counter animation is consistent with other pages.
- **Do not** pass `initialData` unconditionally to `useInfiniteQuery`. The `isInitial` check is what keeps the SSR data from being clobbered on filter changes.
- **Do not** share `tableId` between pages — column settings will leak.
