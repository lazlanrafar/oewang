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

### 1. Form Sheet — standard width

Use for: create/edit forms (transactions, budgets, contacts, debts, accounts).

```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent className="flex h-full flex-col p-0">
    {/* Header — fixed, never scrolls */}
    <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b px-6 py-4 text-left">
      <SheetTitle className="font-medium text-lg">
        Create Transaction
      </SheetTitle>
      {/* optional action buttons */}
    </SheetHeader>

    {/* Body — scrollable */}
    <div className="no-scrollbar flex-1 overflow-y-auto px-6 py-6">
      {/* form content */}
    </div>

    {/* Footer — fixed, never scrolls */}
    <div className="flex shrink-0 items-center justify-end gap-2 border-t px-6 py-4">
      <Button variant="outline" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <Button type="submit">Save</Button>
    </div>
  </SheetContent>
</Sheet>
```

**Rules:**

- Header height: `py-4` (compact) or `py-6` (spacious). Be consistent within a feature area.
- Title: `font-medium text-lg`. Never use `font-serif` in form headers.
- Footer: always `border-t`, right-aligned buttons.

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

| Variant          | `SheetContent` className                    | Max width       | Header style                       |
| ---------------- | ------------------------------------------- | --------------- | ---------------------------------- |
| Form — standard  | `flex h-full flex-col p-0`                  | 520px (default) | `border-b px-6 py-4`               |
| Form — wide      | `flex h-full flex-col p-0 sm:max-w-[630px]` | ~630px          | `border-b px-6 py-4`               |
| Detail — sidebar | `flex h-full flex-col p-0`                  | 520px (default) | `border-b bg-muted/5 px-6 py-6`    |
| Detail — hero    | `flex h-full flex-col p-0`                  | 520px (default) | hero banner + `border-b px-6 py-4` |

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
