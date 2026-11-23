---
name: atomic-design
description: >-
  Atomic Design UI architecture skill for React/Next.js, Svelte 5/SvelteKit/Astro, and Flutter.
  Enforces components/{atoms,molecules,organisms,layouts} hierarchy, shadcn primitives in atoms,
  {module}-{name} naming for organisms and views, reusable select-{entity} combobox molecules,
  DESIGN.md token synchronization, and zero call-site restyling. Use whenever creating, organizing,
  or styling UI components and screens.
---

# Atomic Design & Component Architecture Skill

Enforces strict **Atomic Design** component hierarchy, naming conventions, and design-system integrity across **Next.js (React 19)**, **Svelte 5 (SvelteKit / Astro)**, and **Flutter (`flutter_ui`)**.

---

## 1. The Four Component Layers

All UI components live under `components/{atoms,molecules,organisms,layouts}` (with route-level screens in `views/` or Next.js `app/`):

```text
src/
  components/
    atoms/                                    # Low-level design-system primitives (shadcn/ui, shadcn-svelte, flutter_ui)
      button.tsx
      input.tsx
      badge.tsx
      dialog.tsx
      native-select.tsx                       # ONLY for static compile-time option lists
      index.ts                                # Barrel export per atomic layer (in @repo/ui)
    molecules/                                # Domain-agnostic or single-entity composite controls
      data-table.tsx                          # Standard configurable table molecule
      search-filter-bar.tsx
      select-category.tsx                     # Reusable entity picker combobox (molecules/select-{entity})
      select-user.tsx
      select-outlet.tsx
      index.ts
    organisms/                                # Feature-specific sections, grouped by module and prefixed!
      order/
        order-data-table.tsx
        order-data-table-header.tsx
        order-data-table-skeleton.tsx
        order-summary-card.tsx
      item/
        item-board.svelte
        item-detail-sheet.svelte
    layouts/                                  # Page shells, sidebars, top navigation bars
      app-shell.tsx
      dashboard-layout.tsx
  views/                                      # Full route views (when decoupled from router files)
    order/
      order-list-view.tsx
      order-detail-view.tsx
```

### Layer Classification Rules

| Layer | What Belongs Here | Naming Rule | Allowed Dependencies |
|-------|-------------------|-------------|----------------------|
| **`atoms/`** | Indivisible UI primitives (`Button`, `Input`, `Checkbox`, `Badge`, `Dialog`, `Tooltip`). **All `shadcn` components install into `atoms/`** (`aliases.ui = src/components/atoms`). | `{atom-name}.tsx` / `.svelte` / `.dart` | Design tokens, `clsx`/`tailwind-merge`, Radix/Base UI primitives. **Zero domain knowledge.** |
| **`molecules/`** | Small combinations of atoms solving one focused interaction (`DataTable`, `DateRangePicker`, `EmptyState`, `SelectUser`, `SelectCategory`). | `{molecule-name}` or `select-{entity}` | `atoms/*`, `@repo/utils`. Never coupled to a single page's layout. |
| **`organisms/{module}/`** | Feature-specific sections (`order-data-table`, `item-board`, `customer-loyalty-ledger`). | **Always `{module}/{module}-{name}`**. Never generic `header.tsx` or `table.tsx` inside a module folder. | `atoms/*`, `molecules/*`, feature types/actions. |
| **`layouts/`** | Structural shells (`AppShell`, `AuthSplitLayout`, `PosCashierShell`). | `{name}-layout` or `{name}-shell` | `atoms/*`, `molecules/*`, navigation state. |
| **`views/{module}/`** | Complete screen compositions mounted by a route (`order-list-view`). | `{module}/{module}-{name}-view` | `layouts/*`, `organisms/*`, `molecules/*`, `atoms/*`, URL state. |

---

## 2. Five Non-Negotiable Atomic Rules

### 1. Zero Call-Site Restyling
- **A component owns how it looks.**
- Call sites pass domain data, a documented `variant` / `size` prop, and **at most layout placement classes** (`w-full`, `max-w-md`, `col-span-2`, `flex-1`, `mt-4`).
- **Never pass color, background, border, radius, shadow, font-size, or internal padding overrides (`bg-red-500`, `rounded-xl`, `p-6`, `text-xs`) from a call site into an atom or molecule.**
- If an atom or molecule looks wrong, fix it in `components/atoms/` (and update its specimen on `/design-system` + `DESIGN.md`) so every screen stays consistent.

### 2. Post-Install Rule for `shadcn` Blocks
- Running `bunx shadcn@latest add <component>` places primitives in `components/atoms/`.
- If you install a multi-part `shadcn` block (e.g., sidebar, login, dashboard block), **immediately split it**:
  1. Keep base primitives in `atoms/`.
  2. Move reusable nav/filter pieces into `molecules/`.
  3. Move feature-specific sections into `organisms/{module}/{module}-{name}` and turn any generated page file into a `layout` or `view`.

### 3. Entity Pickers Are `molecules/select-{entity}`
- Never use a native `<select>` for dynamic data coming from the database, API, or workspace (users, categories, outlets, currencies, sprints).
- Build one reusable searchable combobox molecule per entity (`molecules/select-category`, `molecules/select-user`) on top of `molecules/select`.
- Call sites stay declarative: `<SelectCategory type="expense" creatable />`.

### 4. Standard List Screen Anatomy
Every table/list screen across the product follows the exact same composition:
- **Header Line**: `molecules/search-filter-bar` on the left, primary action buttons on the right.
- **Body**: `molecules/data-table` configured by `{module}/{module}-columns.ts`.
- **Two Distinct Empty States**:
  - *"None created yet"* when the collection is empty.
  - *"No items match your filters"* with a clear filter-reset action when URL filters exclude all rows.
- **Overlays**: Modals, sheets, and bulk action bars hang off the `view`, not inside table cells.

### 5. `DESIGN.md` Synchronization
- Read the app's `DESIGN.md` before building or modifying any component.
- Any change to color tokens, typography scale, spacing, radii, or shared atom variants **must update `DESIGN.md` in the same commit**.
