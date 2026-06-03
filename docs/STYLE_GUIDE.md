# Style Guide & Design System

> See also: [CLAUDE.md](../CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BEST_PRACTICE_NEXT_JS.md](./BEST_PRACTICE_NEXT_JS.md) · [ENGINEERING_STANDARDS.md](./ENGINEERING_STANDARDS.md)

---

## 🤖 AI Agent: Update This Doc When

- Adding or modifying presets in `packages/ui/src/styles/presets/`
- Modifying CSS custom properties, utility classes, or themes in `packages/ui/src/globals.css`
- Modifying canvas components in `packages/ui/src/components/atoms/canvas.tsx`
- Registering new fonts in `packages/ui/src/lib/fonts/registry.ts`

---

## Design Philosophy

Oewang uses a **minimalist, flat, and highly typography-focused** design language. It is optimized to feel like a premium financial operating system rather than a generic dashboard.

Key pillars of our design system:
1. **Strict Flatness**: Avoid heavy elevations and complex drop shadows. Interfaces should rely on clean container borders (`border-[#e6e6e6]` or HSL variables) rather than shadows.
2. **Typography is UI**: Hierarchy is established using distinct font pairings (e.g. elegant serif headers paired with clean sans numbers) and letter-spacing (tracking).
3. **Preset-Aware Rendering**: Components must adapt to different visual personalities (such as *Brutalist*, *Soft Pop*, or *Tangerine*) by referencing global CSS variables rather than hardcoding Tailwind utility classes.
4. **Micro-Animations**: Transitions and entry effects should feel organic and snappy, using custom slide/fade presets.

---

## Layout Grid & Canvas System

Every dashboard viewport or workspace sub-view must be structured using the **Canvas components** defined in `packages/ui/src/components/atoms/canvas.tsx`. This ensures structural alignment across the platform.

```tsx
import { BaseCanvas, CanvasHeader, CanvasContent, CanvasGrid, CanvasChart } from "@workspace/ui";

export default function WorkspaceView() {
  return (
    <BaseCanvas>
      <CanvasHeader 
        title="Revenue & Analytics" 
        subtitle="Real-time cash flow overview" 
      />
      <CanvasContent>
        {/* Core page contents live here */}
      </BaseCanvas>
    </BaseCanvas>
  );
}
```

### Canvas Primitives

- **`BaseCanvas`**: The outer container wrapper. Enforces vertical alignment, disables scroll leakage (`overflow-hidden`), and matches the theme-preset background.
- **`CanvasHeader`**: Renders section headers. Uses `font-serif` for titles and muted colors (`text-[#707070]`) for descriptions.
- **`CanvasContent`**: The scrollable container. Inherits standard page padding (`px-6 py-6`) and applies a subtle entry animation:
  `animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out`
- **`CanvasChart`**: Wrapper for charts. Centers grid titles, aligns dynamic legends, and displays a clean loader/skeleton during fetches.
- **`CanvasGrid`**: Flexible key-value display layout (supports `2/2`, `3/1`, or `1/3` grid offsets) with solid borders.

---

## Typography Guidelines

Oewang is paired with several premium Google Fonts configured inside `packages/ui/src/lib/fonts/registry.ts`. By default, it runs **Hedvig Letters** for both serif and sans variants.

### Header/Hero Typography
Use **serif** fonts for greetings, page headings, and large metrics.
- Tailwind Class: `font-serif text-2xl font-normal tracking-tight`
- CSS variable fallback: `var(--font-serif)`

### Metric Values
Big currency amounts should stand out with clean, high-legibility formatting.
- Tailwind Class: `font-serif text-2xl font-medium tracking-tight`

### Labels & Sub-lines
For form labels, metadata captions, and secondary notes, use **sans** fonts.
- Tailwind Class: `font-sans text-[12px] uppercase tracking-widest text-muted-foreground`
- CSS variable fallback: `var(--font-sans)`

### Body Copy
- Tailwind Class: `font-sans text-[14px] leading-relaxed`

---

## Color Tokens & Variables

Instead of default Tailwind colors (e.g. `text-gray-500` or `border-gray-200`), developers must use our custom semantic tokens. This allows layouts to support both light and dark mode presets naturally.

### Colors

| Token Name | Light Mode Value | Dark Mode Value | Tailwind Class / CSS Var |
|------------|------------------|-----------------|--------------------------|
| **Base Background** | `#ffffff` | `#0d0d0d` (5%) | `bg-background` |
| **Card Background** | `#f5f6f4` | `#121212` (7%) | `bg-card` |
| **Borders** | `#e6e6e6` | `#1d1d1d` | `border-border` / `border-[#e6e6e6]` |
| **Muted Text / Axis** | `#707070` | `#666666` | `text-muted-foreground` / `text-[#707070]` |
| **Green Highlight** | `142 71% 45%` (HSL) | `151 100% 39%` (HSL) | `text-emerald-500` / `var(--green)` |
| **Red Highlight** | `358 75% 59%` (HSL) | `357 85% 64%` (HSL) | `text-red-500` / `var(--red)` |

*Note: For dotted empty states on charts or lists, use border-dashed combined with `#e6e6e6` borders.*

---

## Theme Preset System

The global preset manager applies settings via the `data-theme-preset` attribute on the `<html>` root. This system overrides border-radius and shadow parameters in CSS.

### Preset Registry

1. **Default Preset**:
   - Border Radius: `--radius: 0.5rem` (medium rounding)
   - Shadows: Soft, standard shadows
2. **Brutalist Preset** (`data-theme-preset="brutalist"`):
   - Border Radius: `--radius: 0px` (sharp, angular card borders)
   - Borders: Solid thick black borders (`oklch(0 0 0)` in light mode, `oklch(1 0 0)` in dark mode)
   - Shadows: Hard block shadows offset by `4px 4px 0px` (flat neobrutalism shadow aesthetic)
3. **Soft Pop Preset** (`data-theme-preset="soft-pop"`):
   - Border Radius: `--radius: 1rem` (heavy rounding for organic cards/inputs)
   - Colors: Pastel gradients, soft borders, and no shadows
4. **Tangerine Preset** (`data-theme-preset="tangerine"`):
   - Accent Colors: Bright sunset orange/peach highlights

### Writing Preset-Compliant Code
To ensure your components match whatever preset the user selects, **never hardcode border radiuses or shadows** using Tailwind tokens. 

```tsx
// ❌ FORBIDDEN: Hardcoded shapes and shadows break presets!
<Card className="rounded-xl shadow-lg border-gray-200" />

// ✅ CORRECT: Adapts dynamically to Brutalist, Soft Pop, etc.
<Card className="rounded-(--radius) shadow-(--shadow-md) border-border" />

```

---

## Components & UI States

### Cards
Oewang cards are designed to look flat and flush.
- Structure:
```tsx
<Card className="rounded-(--radius) shadow-(--shadow-sm) border-border transition-colors hover:border-primary/50">

  <CardHeader className="p-4 pb-2">
    <CardTitle className="font-sans text-xs uppercase tracking-widest text-muted-foreground">
      Title
    </CardTitle>
  </CardHeader>
  <CardContent className="p-4 pt-0">
    <div className="font-serif text-2xl tracking-tight">Content</div>
  </CardContent>
</Card>
```

### Suggestion Chips
Minimal buttons for actions or AI prompts:
- Class: `border bg-background px-3 py-2 text-xs transition-all hover:border-foreground/50 hover:text-foreground flex items-center gap-1.5 text-muted-foreground cursor-pointer`

### Custom Flat Tab Triggers
Tabs should align flush without rounded boundaries unless dictated by presets:
- Tabs list wrapper: `relative flex w-fit bg-[#f7f7f7] dark:bg-[#131313] p-0 border border-transparent`
- Tab triggers: `group relative flex h-9 items-center gap-1.5 px-3 py-1.5 text-[14px] bg-[#f7f7f7] dark:bg-[#131313] text-[#707070] dark:text-[#666666] hover:text-black hover:dark:text-white data-[state=active]:bg-[#e6e6e6] dark:data-[state=active]:bg-[#1d1d1d] data-[state=active]:text-black dark:data-[state=active]:text-white`

---

## Data Tables & Ledger Lists

The main data grid (seen on the Transactions page) is built upon `@workspace/ui`'s `<DataTable>` wrapper, which implements `@tanstack/react-table` (React Table) and `@tanstack/react-virtual` (React Virtual).

### Table Structure & Styling

To maintain our clean, flat neobrutalist look, the table viewport container should use:
- Outer wrapper border styling: `border-l border-r border-b border-border scrollbar-hide`
- Scroll wrapper: `overflow-auto scrollbar-hide` (using `--scroll-top` CSS custom property dynamically updated on scroll).
- Draggable and resizable columns to allow layout adjustments.

### Sticky Column Offsets
Freezing columns (like selection checkboxes, date, description, or action buttons) should stack cleanly.
- Trigger config:
  `sticky={{ columns: ["select", "date", "name", "actions"], startFromColumn: 0 }}`
- Columns flagged as sticky should use `bg-background z-10` cell styles to prevent overlap issues during horizontal scroll.

### Interactive Inline Cells
Rather than forcing users to open an edit modal for simple updates, data tables support **inline editing** directly inside cells:
- **Components**: Ghost-variant selectors (like `SelectCategory`, `SelectAccount`, or `SelectUser`) with `rounded-none border-none hover:bg-transparent focus-visible:ring-0`.
- **Loading State**: When a cell value is mutating, overlay an absolute loader to block inputs:
  `<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50"><Loader2 className="h-3 w-3 animate-spin text-primary" /></div>`

### Row Grouping Headers
Tables support collapsible groups (e.g. daily, weekly, or monthly transaction grouping). Group rows are rendered as custom table rows rather than full cells:
- **Container tr**:
  `sticky z-30 flex w-full min-w-full cursor-pointer select-none border-border border-b bg-[#FBFBFA] transition-colors hover:bg-[#F2F1EF] dark:bg-[#0A0A0A] hover:dark:bg-[#151515]`
- **Text Style**: Rotating chevron arrow next to uppercase wide-tracked title:
  `text-nowrap font-bold text-[10px] text-muted-foreground uppercase tracking-wider`
- **Group Aggregates**: Displays sub-total sums for the interval right-aligned:
  `ml-auto flex items-center gap-4 text-[10px] font-bold`

### Virtualization & Scrolling Performance
For lists exceeding 100 rows, use **virtualization** to maintain rendering performance.
- Strategy: `virtualizationStrategy="flow"` (uses dynamic block table row elements as padding spacers).
- Infinite load loading spinner centered in footer: `flex items-center justify-center py-4 border-t border-border bg-muted/5 w-full`

