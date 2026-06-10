# Sheet Component Guide

This document defines the standard patterns for every sheet in `apps/app`.  
Always follow these patterns to keep all sheets visually consistent.

---

## How the Sheet Component Works

`SheetContent` from `@workspace/ui` has a two-layer structure:

```
SheetPrimitive.Content   ← fixed-position panel (md:p-4 outer gap, sm:max-w-[520px])
  └─ inner <div>         ← where your className is applied (border, bg-background)
```

Key things to know:

- **`className` you pass goes to the inner div**, not the outer container.
- The outer container provides `md:p-4` — a 16px floating gap from viewport edges on `md+` screens. **Do not fight this** with `rounded-none shadow-none border-l`. Those classes make the sheet appear broken on desktop.
- The outer container's max-width is `sm:max-w-[520px]`. Passing `sm:max-w-[540px]` in `className` has no effect on overall sheet width.
- Always pass **`p-0`** in `className` and manage padding yourself inside. The default `p-6` is too coarse for most layouts.

---

## Variants

### 1. Form Sheet — standard width (Midday-style)

Use for: create/edit forms (transactions, budgets, contacts, debts, accounts).

This is the canonical pattern for every form sheet. Header has no border, footer is **absolutely positioned at the bottom inside the sheet** (no border), and the body scrolls under it with bottom padding so the last field is never hidden.

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent className="flex h-full flex-col p-0">
    {/* Header — title only, no border, generous margin-bottom */}
    <SheetHeader className="shrink-0 px-6 pt-6">
      <SheetTitle className="text-lg">Create Transaction</SheetTitle>
    </SheetHeader>

    {/* Body — scrollable, padded so last field clears the absolute footer */}
    <div className="no-scrollbar flex-1 overflow-y-auto px-6 pt-6 pb-[100px]">
      <Form {...form}>
        <form id="my-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* form fields */}
        </form>
      </Form>
    </div>

    {/* Footer — absolutely positioned, no border, single full-width submit button */}
    <div className="absolute bottom-0 left-0 right-0 bg-background p-6">
      <Button form="my-form" type="submit" className="w-full" disabled={!form.formState.isDirty || isLoading}>
        {isLoading ? "Saving..." : "Save"}
      </Button>
    </div>
  </SheetContent>
</Sheet>
```

**Layout rules:**

- **Header**: `shrink-0 px-6 pt-6` — no border, no `py-` (the body provides the gap with its own `pt-6`).
- **Title**: `text-lg` — no `font-medium` / `font-serif`. Lighter weight, generous spacing.
- **Body**: `pb-[100px]` so the last field clears the absolutely-positioned footer when scrolled to the bottom.
- **Footer**: `absolute bottom-0 left-0 right-0 bg-background p-6` — sits on top of the body, **no `border-t`**, with `bg-background` so scrolling form content is hidden behind it (no bleed-through).
- **Submit button**: `className="w-full"` — single full-width button, **no Cancel button**. Users close the sheet with the overlay or Esc key.
- **Form id**: give the `<form>` an `id` so the submit button outside it can target it via `form="my-form" type="submit"`.

**Field rules:**

- **Spacing between fields**: `space-y-6` on the `<form>` (or `space-y-8` for forms with many fields and visual sections).
- **Two-column row**: `<div className="grid grid-cols-2 gap-4">` — never `flex space-x-4`.
- **Labels**: `<FormLabel className="text-xs font-normal text-muted-foreground">` — small, muted, regular weight.
- **Descriptions**: plain `<FormDescription>` (no size override). Use them only when the hint adds real value; not every field needs one.
- **Input/Button/Select/Combobox/InputDate/CurrencyInput height**: **always use the default `h-9`** from `@workspace/ui`. **Never override with `h-10`, `h-11`, or `h-8`** — those break vertical alignment between sibling fields in a 2-column row. Heights are centralized in the atom components so all form elements stay consistent.
- **Non-FormField wrappers**: if you need a label + control without a `FormField` (e.g. a disabled display-only field), wrap it in `<FormItem>` so it gets the same `grid gap-2` spacing as adjacent FormItems. Don't use bare `<div className="flex flex-col">`.
- **Never pass `className="flex flex-col"` to `<FormItem>`** — `FormItem` defaults to `grid gap-2`, and overriding it with `flex flex-col` removes the gap between label and input. In a 2-column row, sibling fields with mixed `flex flex-col` and default styling end up at different Y positions even when both inputs are `h-9`. Leave `FormItem` className empty unless you have a deliberate layout reason.

**Behaviour rules:**

- **Submit disabled** when `!form.formState.isDirty` (matches Midday) so users can't submit unchanged forms.
- **Auto-focus** the first field with `autoFocus` on its `Input`.
- **`autoComplete="off"`** on most inputs to prevent browser autofill noise.

---

### 2. Form Sheet — wide (complex forms only)

Use for: invoice form (many fields + sidebar preview).  
**Only use this variant if the form genuinely needs more horizontal space.**

```tsx
<SheetContent className="flex h-full flex-col p-0 sm:max-w-[630px]">
```

> `sm:max-w-[630px]` on the inner div overflows the outer container's `sm:max-w-[520px]` because `position: fixed` parents don't clip children by default. The sheet will visually be ~630px wide. Use with care.

---

### 3. Detail Sheet — with sidebar-style header

Use for: read-only detail views (debt detail, contact detail, account detail).

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent className="flex h-full flex-col p-0">
    {/* Header */}
    <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b bg-muted/5 px-6 py-6 text-left">
      <div className="space-y-1">
        <SheetTitle className="font-medium text-xl">{item.name}</SheetTitle>
        <p className="text-muted-foreground text-xs uppercase tracking-widest">
          {item.subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {/* edit / delete buttons */}
      </div>
    </SheetHeader>

    {/* Body */}
    <div className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-6 py-6">
      {/* detail content */}
    </div>
  </SheetContent>
</Sheet>
```

**Rules:**

- `bg-muted/5` on the header gives a subtle distinction from the body.
- No footer — actions live in the header row.

---

### 4. Detail Sheet — with hero banner

Use for: app store cards, any sheet that showcases a logo/image at the top.

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent className="flex h-full flex-col p-0">
    {/* Hero — full-bleed, no horizontal padding */}
    <div className="relative flex h-[200px] w-full shrink-0 items-center justify-center overflow-hidden bg-[#fafafa] dark:bg-[#0c0c0c]">
      {/* dot-grid background */}
      <div
        className="absolute inset-0 dark:hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle, #e0e0e0 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          backgroundImage: "radial-gradient(circle, #333 1px, transparent 1px)",
          backgroundSize: "10px 10px",
        }}
      />
      {/* 64×64 logo centered */}
      <div className="relative z-10 [&_img]:!h-16 [&_img]:!w-16 [&_svg]:!h-16 [&_svg]:!w-16">
        <Logo />
      </div>
    </div>

    {/* Title row */}
    <div className="flex shrink-0 items-center justify-between border-b px-6 pb-4 pt-4">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg leading-none">{item.name}</h3>
          {item.installed && (
            <div className="size-1.5 rounded-full bg-green-500" />
          )}
        </div>
        <span className="mt-1.5 block text-muted-foreground text-xs">
          {item.category} • By Oewang
        </span>
      </div>
      {/* optional action button */}
    </div>

    {/* Scrollable body */}
    <div className="flex min-h-0 flex-1 flex-col px-6">
      <ScrollArea className="h-0 flex-1" hideScrollbar>
        {/* content */}
      </ScrollArea>

      {/* Footer inside body */}
      <div className="shrink-0 border-t py-4">
        <p className="text-[10px] text-muted-foreground">Footer note</p>
      </div>
    </div>
  </SheetContent>
</Sheet>
```

---

## Quick Reference

| Variant          | `SheetContent` className                    | Max width       | Header style                       | Footer style                                |
| ---------------- | ------------------------------------------- | --------------- | ---------------------------------- | ------------------------------------------- |
| Form — standard  | `flex h-full flex-col p-0`                  | 520px (default) | `shrink-0 px-6 pt-6` (no border)   | `absolute bottom-0 left-0 right-0 bg-background p-6` (full-width button) |
| Form — wide      | `flex h-full flex-col p-0 sm:max-w-[630px]` | ~630px          | `shrink-0 px-6 pt-6`               | `absolute bottom-0 left-0 right-0 bg-background p-6`                     |
| Detail — sidebar | `flex h-full flex-col p-0`                  | 520px (default) | `border-b bg-muted/5 px-6 py-6`    | none — actions in header                    |
| Detail — hero    | `flex h-full flex-col p-0`                  | 520px (default) | hero banner + `border-b px-6 py-4` | inline in body                              |

---

## Form Sheet Behaviour

This section documents how a form sheet should **behave** at runtime — independent of layout. Every form sheet in `apps/app` should follow these patterns so the user experience is consistent across create/edit flows for any entity.

### Open / close

| When                         | Behaviour                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| User clicks "Add" / "Edit"   | Parent sets `open={true}` and passes the entity (`undefined` for create, object for edit). |
| User clicks the overlay      | `onOpenChange(false)` fires — sheet closes. Form state is preserved until next open. |
| User presses `Esc`           | Same as overlay click.                                                               |
| User submits successfully    | Sheet calls `onOpenChange(false)` itself after the mutation resolves.                |
| There is **no Cancel button** | Users dismiss via overlay/Esc. See [Form Sheet — standard width](#1-form-sheet--standard-width-midday-style). |

### Form state lifecycle

```tsx
const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: { /* empty / safe defaults */ },
});

// Reset on every open so re-opening doesn't show stale values
useEffect(() => {
  if (!open) return;
  if (entity) {
    form.reset({ /* map entity → form values */ });
  } else {
    form.reset({ /* defaults for create */ });
  }
}, [open, entity, form]);
```

- **Always reset on `open` change** — not just on mount. A user can close → re-open the same sheet for a different entity in one mounted instance.
- **Edit mode**: hydrate the form from the entity prop. Map external types (Date → `yyyy-MM-dd` string, numeric strings → numbers) here.
- **Create mode**: reset to defaults. Pull sensible defaults from app state where possible (e.g. `user?.id` for `assignedUserId`, today's date for `date`).

### Submit button states

```tsx
<Button
  form="my-form"                                  // targets the form by id
  type="submit"
  className="w-full"
  disabled={isLoading || !form.formState.isDirty}
>
  {isLoading ? "Saving..." : entity ? "Update" : "Create"}
</Button>
```

| State                                   | Result                                                |
| --------------------------------------- | ----------------------------------------------------- |
| Form pristine (`!isDirty`)              | Disabled — nothing to submit                          |
| Form dirty + valid                      | Enabled                                               |
| Form submitting (`isLoading=true`)      | Disabled + label changes to "Saving..."               |
| Edit mode label                         | "Update" / "Save"                                     |
| Create mode label                       | "Create"                                              |

### Mutation flow (TanStack Query)

```tsx
async function onSubmit(data: FormValues) {
  setIsLoading(true);
  try {
    const result = entity
      ? await updateEntity(entity.id, payload)
      : await createEntity(payload);

    if (!result.success) throw new Error(result.error);

    // 1. Toast first — user sees feedback immediately
    toast.success(entity ? "Updated" : "Created");

    // 2. Optimistic cache patch — UI updates without a refetch round-trip
    if (result.data) {
      queryClient.setQueriesData<any>({ queryKey: ["entities"], exact: false }, (old) => {
        if (!old) return old;
        // Handle both infinite queries (pages[]) and regular queries (data[])
        // See transaction-form-sheet.tsx for the canonical pattern.
      });
    }

    // 3. Close the sheet
    form.reset();
    onOpenChange(false);
    onSuccess?.();

    // 4. Background reconciliation — fixes pagination totals, derived fields, etc.
    void queryClient.invalidateQueries({ queryKey: ["entities"] });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to save");
  } finally {
    setIsLoading(false);
  }
}
```

**Rules:**

1. **Order matters**: toast → optimistic patch → close → invalidate. Closing first feels laggy because the toast appears after the sheet is gone.
2. **Optimistic patches must handle both shapes** — `useInfiniteQuery` returns `{ pages: [...] }`, `useQuery` returns the data directly. Check both via `"pages" in old` and `"data" in old`.
3. **Always invalidate at the end** even after an optimistic patch. The patch updates the row; invalidation refreshes totals, ordering, and any computed fields the server controls.
4. **Never throw inside the `try` block without catching** — uncaught errors leave `isLoading=true` forever. The `finally` block handles this.
5. **Don't `await queryClient.invalidateQueries`** — it can re-fetch slowly. Fire-and-forget with `void` so the sheet closes immediately.

### Schema validation

```tsx
const getSchema = (dictionary: Dictionary) =>
  z.object({
    amount: z.coerce.number().positive(dictionary.transactions.errors.amount_positive),
    date: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
      message: dictionary.transactions.errors.invalid_date,
    }),
    // ...
  });

const schema = useMemo(() => getSchema(dictionary), [dictionary]);
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), ... });
```

- **Schema factory takes `dictionary`** so error messages are translatable. Never hardcode English error strings.
- **`useMemo` the schema** keyed on dictionary so it doesn't recreate on every render.
- **`z.coerce.number()`** for fields where the input is a string but the API expects a number.

### Permissions

```tsx
interface Props {
  // ...
  canEdit?: boolean;
}

if (!mounted || !dictionary || !canEdit) return null;
```

- **Permission gating happens at the sheet level**, not at each field. If a user lacks edit access, render nothing — don't show a disabled sheet.
- **Resolve `canEdit` from workspace role** in the parent (see `canEditWorkspaceData(workspace?.current_user_role)`).

### Hydration / SSR

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

if (!mounted) return null;
```

- Form sheets that depend on `useForm` should guard against SSR mismatches by returning `null` until mounted. `react-hook-form` generates internal IDs that can differ between server and client.
- The `mounted` gate also prevents the sheet from briefly rendering with empty default values before the `useEffect` hydration from the `entity` prop runs.

### Dependent fields

When changing one field should update another, do it in the field's `onChange`/`onValueChange` handler, **not in a separate `useEffect`**:

```tsx
const handleTabChange = (value: string) => {
  setActiveTab(value);
  form.setValue("type", value);
  if (value === "transfer") {
    form.setValue("categoryId", undefined); // clear because transfers have no category
  }
};
```

- `useEffect` watching form values causes a re-render cascade and can fight `react-hook-form`'s internal state.
- Use `form.watch("field")` only for **derived display logic** (e.g. coloring an amount based on `type`), not for setting other field values.

### Async-loaded data inside the sheet

For data only needed when the sheet is open (e.g. attachments, related records), gate the query with `enabled`:

```tsx
const { data } = useQuery({
  queryKey: ["entity", "attachments", entity?.id],
  queryFn: () => getAttachments(entity!.id),
  enabled: open && !!entity?.id,
});
```

- Don't fetch when the sheet is closed — it wastes bandwidth and increases initial page load.
- Use `enabled: open && ...` for any query specific to the sheet.

---

## Rules That Apply to Every Sheet

1. **Never use `rounded-none border-l shadow-none`** — these fight the component's floating style and make the sheet look broken on desktop.
2. **Always use `p-0`** in `SheetContent` className. Manage your own padding inside.
3. **Always use `shrink-0`** on the header and footer so they never scroll.
4. **Always use `no-scrollbar flex-1 overflow-y-auto`** on the scrollable body section. Never put `overflow-y-auto` on `SheetContent` itself.
5. **Never put content directly inside `SheetContent`** without a structural header/body split.
6. **`SheetTitle` is required** for accessibility — use `className="sr-only"` if the title is visual but you need a semantic title, or skip it and let the component render a hidden title via `title` prop.
7. **Width** — do not pass `sm:max-w-[540px]` or `sm:max-w-[520px]` in className; those values equal the outer container's max-width and have no visible effect. Only use `sm:max-w-[630px]` (or larger) if you genuinely need a wide sheet.

---

## What Needs Fixing (Existing Sheets)

These existing sheets deviate from the standard and should be updated:

| File                           | Issue                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `debt-form-sheet.tsx`          | Uses `rounded-none border-l shadow-none` — remove these                                  |
| `debt-detail-sheet.tsx`        | Same — remove `rounded-none border-l shadow-none`                                        |
| `contact-detail-sheet.tsx`     | Same — remove `rounded-none border-l shadow-none`                                        |
| `budget-form-sheet.tsx`        | Uses default `<SheetContent>` with no `p-0` — add `className="flex h-full flex-col p-0"` |
| `invoice-detail-sheet.tsx`     | Uses default `<SheetContent>` — add `className="flex h-full flex-col p-0"`               |
| `calendar-day-sheet.tsx`       | Uses `p-0` but missing `flex h-full flex-col`                                            |
| `transaction-form-sheet.tsx`   | Missing `SheetContent` className — add `className="flex h-full flex-col p-0"`            |
| `transaction-detail-sheet.tsx` | Missing `SheetContent` className — add `className="flex h-full flex-col p-0"`            |
