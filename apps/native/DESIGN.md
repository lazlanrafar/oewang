---
version: alpha
name: Oewang Mobile
description: Financial OS — Flutter mobile app; dark-first, flat/square, monochrome UI with a coral brand accent, ported from the web app's design tokens.
colors:
  background: "#0D0D0D"
  foreground: "#FAFAFA"
  card: "#121212"
  cardForeground: "#FAFAFA"
  popover: "#121212"
  popoverForeground: "#FAFAFA"
  muted: "#1C1C1C"
  mutedForeground: "#8A8A8A"
  accent: "#1C1C1C"
  accentForeground: "#FAFAFA"
  border: "#2A2A2A"
  input: "#1C1C1C"
  primary: "#FAFAFA"
  primaryForeground: "#18181B"
  ring: "#D4D4D8"
  blue: "#60A5FA"
  red: "#F87171"
  coral: "#FF5A5F"
  destructive: "#FF3838"
typography:
  sans:
    fontFamily: Hedvig Letters Sans
    fontSize: 14px
    fontWeight: 400
  currency:
    fontFamily: Hedvig Letters Sans
    fontSize: 14px
    fontWeight: 400
    fontFeature: "'tnum' 1"
  mono:
    fontFamily: Roboto Mono
    fontSize: 13px
    fontWeight: 400
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  xxl: 16px
  pill: 999px
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    typography: "{typography.sans}"
    rounded: "0"
    height: 44px
  button-outlined:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "0"
    height: 44px
  button-danger:
    backgroundColor: "{colors.coral}"
    textColor: "#FFFFFF"
    rounded: "0"
    height: 44px
  fab:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "{rounded.pill}"
    size: 56px
  bottomNav:
    backgroundColor: "{colors.background}"
    textColor: "{colors.mutedForeground}"
    height: 64px
  listRow:
    backgroundColor: "{colors.background}"
    textColor: "{colors.mutedForeground}"
    typography: "{typography.sans}"
    padding: "{spacing.lg}"
  segmentedTabs:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primaryForeground}"
    rounded: "0"
    height: 44px
  modalSheet:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xxl}"
---

## Overview

Oewang mobile is the Financial OS's Flutter client — a dark-first, flat, monochrome UI with a single coral brand accent, porting its color and type tokens directly from the web app's `packages/ui/src/globals.css`. The app defaults to dark theme (`ThemeMode.dark`) and follows the web's flat interaction language: no Material ripple/splash anywhere (`splashFactory: NoSplash`, all highlight/hover colors transparent), replaced by a scale-to-0.96 press animation on every tappable surface.

## Colors

The dark palette (default theme) is a near-black neutral scale: `background` (#0D0D0D) and `card` (#121212) sit one step apart, `foreground` (#FAFAFA) carries all text, and `mutedForeground` (#8A8A8A) — raised from the web's literal #616161 to clear the 4.5:1 WCAG body-text minimum — handles secondary text and icons. `primary`/`primaryForeground` invert to near-white-on-near-black for the highest-emphasis surfaces (buttons, FAB, selected segmented tab). `coral` (#FF5A5F) is the one brand accent, reserved for the FAB, destructive/delete affordances, and the transaction swipe-to-delete action. `blue`/`red` are Tailwind's `blue-400`/`red-400`, used only for income/expense amount text and swappable per-workspace via the `incomeExpensesColor` setting.

## Themes

The DESIGN.md spec in use here has no theme-mode syntax, so light-mode is documented as a fallback table rather than parallel tokens. Light is not the default theme (the app defaults to dark) but is fully supported and toggled by the user.

| Token | Dark (default) | Light |
| --- | --- | --- |
| background | #0D0D0D | #FFFFFF |
| foreground | #FAFAFA | #121212 |
| card | #121212 | #F5F2EB |
| cardForeground | #FAFAFA | #09090B |
| popover | #121212 | #F5F2EB |
| popoverForeground | #FAFAFA | #09090B |
| muted | #1C1C1C | #E5E2D9 |
| mutedForeground | #8A8A8A | #616161 |
| accent | #1C1C1C | #F0EEE8 |
| accentForeground | #FAFAFA | #18181B |
| border | #2A2A2A | #DAD8D2 |
| input | #1C1C1C | #E5E5EC |
| primary | #FAFAFA | #18181B |
| primaryForeground | #18181B | #FAFAFA |
| ring | #D4D4D8 | #18181B |
| blue | #60A5FA | #2563EB |
| red | #F87171 | #DC2626 |
| coral | #FF5A5F | #FF5A5F (fixed) |
| destructive | #FF3838 | #E94545 |

`coral` is a fixed brand color and does not change between themes.

## Typography

Three named families cover the entire app: `sans` (Hedvig Letters Sans) for all UI text, `currency` (the same Hedvig Letters Sans family, set with tabular figures via the OpenType `tnum` feature) for every money amount so digit columns align in lists, and `mono` (Roboto Mono, a fallback for Geist Mono which has no Google Fonts equivalent) reserved for the web's `--font-mono` contexts. There is no fixed display/heading scale — screens compose `sans`/`currency` at call-site sizes (app-bar titles at 17px, row titles at 14px/500, row subtitles and section labels at 12px, bottom-nav labels at 11px).

## Layout

Spacing follows Tailwind's 4px grid (`xs` 4px through `xxl` 32px). Grouped-list screens (e.g. Settings) use a "gray backdrop, white section cards" pattern: `SectionLabel` leaves an 8px transparent gap before each section header so the muted page background shows through as a grouping seam between cards.

## Elevation & Depth

The app is flat by design: cards, dialogs, and bottom sheets are all `elevation: 0`, and hierarchy comes from color contrast (`card` vs `background`) and 1px `border` dividers, not shadows. The one exception is the FAB, which carries `elevation: 2` to read as the floating primary action.

## Shapes

Square by default. Every themed component shape (buttons, cards, dialogs, bottom sheets, inputs) is `BorderRadius.zero`. There are exactly two intentional exceptions: the FAB, which is a full circle, and the top edge of modal bottom sheets, which use a 16px (`rounded.xxl`) radius — confirmed consistent across the workspace-switcher and card-expenses-display sheets.

## Components

- **Button** — the only action-button primitive; every screen uses it so buttons stay identical. Four variants (`primary` filled, `outlined` bordered, `danger` coral-filled, `ghost` transparent), 44px height, full-width by default, `sans` 14px/500 label, square corners, `elevation: 0`, and a built-in spinner when `loading`.
- **FAB** — a single 56px circular FAB (`OewangFab`), shown only on the Transactions tab. Sets its own `primary`/`primaryForeground` colors and `elevation: 2` directly on the widget rather than through the app theme.
- **Bottom navigation** — a custom 5-tab bar (`OewangBottomNav`; Trans/Debt/Stats/Accounts/More), 64px tall, 22px icons, 11px labels. Selected tab uses `foreground`, not `coral` — the coral `selectedItemColor` declared on Flutter's `BottomNavigationBarThemeData` in `app_theme.dart` is unused because this custom widget replaces Material's `BottomNavigationBar` entirely.
- **List row** (`ListRow`) — the grouped-list item: 22px `mutedForeground` leading icon, 14px/500 title, optional 12px `mutedForeground` subtitle, 16px padding, painted on `background` so it sits on the gray grouping backdrop.
- **Segmented tabs** (`OewangSegmentedTabs`) — flat track (`#131313` dark / `#F7F7F7` light — kept literal to match web), selected segment filled with `primary`/`primaryForeground`, square corners, 44px default height.
- **Modal bottom sheet** — the only rounded surface in the app; 16px top radius, `card` or `background` fill depending on sheet.
- **Swipe action row** (`SwipeActionRow`) — settings-list rows (Categories, Account Groups, Accounts) that slide 96px left on tap to reveal a `coral` Delete action; 180ms ease-out slide.
- **Press feedback** (`PressScale`) — the app-wide replacement for Material ripple: scales a tappable child to 0.96 over 100ms ease-out on press, skipped entirely when the OS "reduce motion" setting is on.

## Do's and Don'ts

- **Don't** rely on Material's default ripple/splash/hover/highlight feedback — it's killed app-wide (`app_theme.dart`). **Do** wrap tappable surfaces in `PressScale` instead.
- **Don't** round corners outside the two documented exceptions (the FAB circle and the 16px modal-bottom-sheet top edge). Every other shape is square.
- **Don't** drop below a 4.5:1 contrast ratio for muted/secondary text — `mutedForeground` and the segmented-tabs inactive color were both deliberately raised from their original web literals (`#616161`, `#666666`) to `#8A8A8A` for this reason.
