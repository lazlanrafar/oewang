# Website Marketing GSAP Minimal SPA Refactor

## TL;DR

> **Quick Summary**: Refactor `apps/website` into a minimal, editorial, single-page marketing experience inspired by Shopify Editions Winter 2026, using GSAP for restrained scroll/reveal motion while preserving localized routes and legal pages.
>
> **Deliverables**:
> - One polished localized homepage at `apps/website/app/[locale]/page.tsx`
> - Simplified anchor-based header/footer
> - GSAP dependency and scoped reduced-motion-safe animation system
> - Product/resource marketing pages removed or redirected to homepage anchors; `terms` and `policy` preserved
> - Updated localized dictionaries, SEO/schema, sitemap, and Playwright E2E
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 → T4 → T8 → T11 → T14 → Final verification

---

## Context

### Original Request
“Refactor my website marketing to using gsap style but minimalism. single page application for the moment. remove other page and follow this references website by shopify https://www.shopify.com/editions/winter2026”

### Interview Summary
**Key Discussions**:
- Route strategy: preserve legal pages only; consolidate/remove marketing/product/resource pages.
- GSAP approach: install GSAP rather than relying on CSS-only motion.
- Testing: tests-after with Playwright E2E plus mandatory agent-executed QA.
- Localization: keep `en`, `id`, and `ja` locale support.

**Research Findings**:
- `apps/website/app/[locale]/page.tsx` currently composes `Header`, `HeroSection`, `HowItWorksSection`, `FeatureShowcases`, `CTASection`, and `Footer`.
- Existing routes under `apps/website/app/[locale]/` include `agents`, `chat`, `computer`, `customers`, `docs`, `download`, `features`, `integrations`, `policy`, `pre-accounting`, `pricing`, `sdks`, `story`, `support`, `terms`, `testimonials`, and `updates`.
- `apps/website/components/layout/header.tsx` currently has multi-page navigation and mega menus.
- `apps/website/components/layout/footer.tsx` currently has multi-page link groups, theme toggle, language links, and social links.
- `apps/website/package.json` does not currently include GSAP.
- Website verification scripts include `build`, `lint`, `typecheck`, and `test:e2e`; current E2E smoke test is `apps/website/e2e/home.spec.ts`.
- Reference analysis: Shopify Editions Winter 2026 uses a story-led editorial long page, sticky/anchor navigation, media-led proof, calm spacing, contextual CTAs, and section-by-section reveal motion.

### Metis Review
**Identified Gaps** (addressed):
- Brand tone was not explicitly chosen; default to premium minimalist fintech/editorial.
- Legal route handling needed explicit guardrail; preserve `terms` and `policy` only.
- Scope creep risk: avoid rebuilding product features, dashboard UI, API, or exact Shopify clone.
- Accessibility/performance needed explicit acceptance criteria for GSAP, reduced motion, and route redirects.

---

## Work Objectives

### Core Objective
Transform the marketing website into a single-page, premium minimalist landing experience with restrained GSAP motion and a Shopify Editions-inspired editorial structure, while keeping Oewang’s own brand, copy, locale system, and legal pages.

### Concrete Deliverables
- `apps/website/package.json` updated with GSAP dependency.
- New or refactored minimal motion utilities/components under `apps/website/components` or `apps/website/lib`.
- Refactored homepage at `apps/website/app/[locale]/page.tsx`.
- Simplified header/footer in `apps/website/components/layout/`.
- Consolidated single-page sections under `apps/website/components/sections/`.
- Removed/redirected non-legal marketing routes under `apps/website/app/[locale]/`.
- Updated dictionaries in `apps/website/lib/translations/website-en.ts`, `website-id.ts`, and `website-ja.ts`.
- Updated SEO/sitemap metadata and E2E tests.

### Definition of Done
- [ ] `bun run --cwd apps/website build` passes.
- [ ] `bun run --cwd apps/website typecheck` passes.
- [ ] `bun run --cwd apps/website lint` passes.
- [ ] `bun run --cwd apps/website test:e2e` passes.
- [ ] Playwright verifies homepage anchors, CTAs, legal routes, and redirects.
- [ ] GSAP motion respects `prefers-reduced-motion` and does not block first render.
- [ ] `terms` and `policy` remain reachable for all supported locales.

### Must Have
- Single-page localized marketing homepage with anchor navigation.
- Minimal GSAP reveal/scroll animations only where they add editorial polish.
- Legal pages preserved: `terms` and `policy`.
- All other product/resource marketing pages removed or redirected to homepage anchors.
- Original Oewang brand/copy; no copied Shopify copy, imagery, or exact visual identity.

### Must NOT Have (Guardrails)
- Do not modify `apps/app`, `apps/api`, database, auth, payment, or product dashboard code.
- Do not copy Shopify text, assets, section labels, or brand-specific design elements.
- Do not add heavy scroll-jacking or inaccessible motion.
- Do not remove locale support.
- Do not remove legal pages.
- Do not create a feature catalog with many pages; keep “single page for the moment”.

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: Playwright E2E for website; TypeScript/Biome/build for static verification
- **If TDD**: Not selected

### QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright - navigate, interact, assert DOM, screenshot.
- **Routing**: Use Playwright and/or Bash URL checks against local website server.
- **Library/Module**: Use Bash - inspect package scripts and run commands.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation and decisions):
├── T1: GSAP dependency + motion architecture [quick]
├── T2: Single-page content model + localized copy map [writing]
├── T3: Route inventory + legal-preserving redirect plan [quick]
├── T4: Homepage section architecture blueprint [visual-engineering]
└── T5: SEO/schema/sitemap consolidation plan [quick]

Wave 2 (Parallel implementation modules):
├── T6: Minimal GSAP animation primitives [visual-engineering] (depends: T1)
├── T7: Editorial hero + proof visual [visual-engineering] (depends: T2, T4)
├── T8: Anchor-based header/navigation [visual-engineering] (depends: T3, T4)
├── T9: Narrative sections + feature proof modules [visual-engineering] (depends: T2, T4, T6)
├── T10: Minimal footer + language/legal controls [quick] (depends: T3)
└── T11: Locale dictionary updates [writing] (depends: T2, T7, T9, T10)

Wave 3 (Consolidation and cleanup):
├── T12: Remove/redirect non-legal routes [quick] (depends: T3, T8)
├── T13: Homepage composition integration [visual-engineering] (depends: T6-T11)
├── T14: SEO/schema/sitemap updates [quick] (depends: T5, T12, T13)
└── T15: Playwright E2E updates [unspecified-high] (depends: T12-T14)

Wave 4 (Hardening):
├── T16: Accessibility, reduced-motion, and performance pass [unspecified-high] (depends: T13)
├── T17: Build/typecheck/lint fixes [quick] (depends: T12-T16)
└── T18: Cross-locale final polish [writing] (depends: T11, T13, T15)

Wave FINAL:
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high + playwright)
└── F4: Scope Fidelity Check (deep)
```

### Dependency Matrix

- **T1**: Blocks T6
- **T2**: Blocks T7, T9, T11
- **T3**: Blocks T8, T10, T12
- **T4**: Blocks T7, T8, T9
- **T5**: Blocks T14
- **T6**: Blocked by T1; blocks T9, T13
- **T7**: Blocked by T2, T4; blocks T11, T13
- **T8**: Blocked by T3, T4; blocks T12, T13
- **T9**: Blocked by T2, T4, T6; blocks T11, T13
- **T10**: Blocked by T3; blocks T11, T13
- **T11**: Blocked by T2, T7, T9, T10; blocks T13, T18
- **T12**: Blocked by T3, T8; blocks T14, T15
- **T13**: Blocked by T6-T11; blocks T14, T15, T16, T18
- **T14**: Blocked by T5, T12, T13; blocks T15
- **T15**: Blocked by T12-T14; blocks T17, Final QA
- **T16**: Blocked by T13; blocks T17
- **T17**: Blocked by T12-T16; blocks Final QA
- **T18**: Blocked by T11, T13, T15; blocks Final QA

### Agent Dispatch Summary

- **Wave 1**: 5 tasks - T1/T3/T5 `quick`, T2 `writing`, T4 `visual-engineering`
- **Wave 2**: 6 tasks - T6/T7/T8/T9 `visual-engineering`, T10 `quick`, T11 `writing`
- **Wave 3**: 4 tasks - T12/T14 `quick`, T13 `visual-engineering`, T15 `unspecified-high`
- **Wave 4**: 3 tasks - T16 `unspecified-high`, T17 `quick`, T18 `writing`
- **Final**: 4 parallel reviewers

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.

- [ ] 1. GSAP dependency and motion architecture

  **What to do**:
  - Add GSAP to `apps/website` dependencies using the repo’s Bun/workspace dependency conventions.
  - Define where animation code should live: a small client component/hook/module scoped to the marketing homepage.
  - Document animation rules in code comments only where necessary: reveal-on-enter, subtle parallax/translate, anchor nav state, cleanup on unmount.
  - Respect `prefers-reduced-motion`; do not animate when reduced motion is enabled.

  **Must NOT do**:
  - Do not add broad global animation side effects.
  - Do not introduce scroll-jacking.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Dependency and architecture scaffolding should be small and contained.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Design-heavy work happens in later tasks.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6
  - **Blocked By**: None

  **References**:
  - `apps/website/package.json:14-39` - Current dependencies and scripts; add GSAP here.
  - `apps/website/components/sections/hero.tsx:21-100` - Existing motion-free hero structure to enhance later.
  - `apps/website/components/layout/header.tsx:1-349` - Existing client component patterns and state cleanup expectations.
  - External: GSAP official docs - Use only standard import/cleanup patterns; avoid plugin-heavy setup unless needed.

  **Acceptance Criteria**:
  - [ ] GSAP dependency is present in `apps/website/package.json`.
  - [ ] Animation scaffolding is isolated to website marketing components/utilities.
  - [ ] Reduced-motion handling is present before animations run.
  - [ ] `bun run --cwd apps/website typecheck` passes.

  **QA Scenarios**:

  ```
  Scenario: GSAP dependency is available
    Tool: Bash
    Preconditions: Repo root with dependencies installed.
    Steps:
      1. Run `bun run --cwd apps/website typecheck`.
      2. Inspect output for zero TypeScript errors related to GSAP imports.
    Expected Result: Typecheck exits 0 with no unresolved module errors.
    Failure Indicators: `Cannot find module 'gsap'` or type errors.
    Evidence: .sisyphus/evidence/task-1-gsap-typecheck.txt

  Scenario: Reduced motion disables animation setup
    Tool: Playwright
    Preconditions: Website dev/start server running.
    Steps:
      1. Set reduced motion media to `reduce`.
      2. Navigate to `/en`.
      3. Assert `body` is visible and no animated transform is required for primary content visibility.
    Expected Result: Hero headline and CTA are visible without waiting for animation completion.
    Evidence: .sisyphus/evidence/task-1-reduced-motion.png
  ```

  **Commit**: YES
  - Message: `feat(website): add gsap motion foundation`
  - Files: `apps/website/package.json`, related lockfile, scoped animation utility/component
  - Pre-commit: `bun run --cwd apps/website typecheck`

- [ ] 2. Single-page content model and localized copy map

  **What to do**:
  - Define the homepage narrative structure: hero, anchored value sections, proof/demo module, trust/micro-testimonial section, final CTA.
  - Convert existing product/resource copy into concise single-page marketing copy.
  - Prepare equivalent keys for `en`, `id`, and `ja` dictionaries.
  - Default tone: premium minimalist fintech/editorial.

  **Must NOT do**:
  - Do not copy Shopify wording or seasonal edition labels.
  - Do not expand into a feature catalog.

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Primary task is content modeling and localized copy structure.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `geo-content`: This is copy structure, not full GEO audit.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T9, T11
  - **Blocked By**: None

  **References**:
  - `apps/website/lib/translations/website-en.ts:1-159` - Existing copy keys and content domains.
  - `apps/website/lib/translations/website-id.ts` - Indonesian copy must preserve structure.
  - `apps/website/lib/translations/website-ja.ts` - Japanese copy must preserve structure.
  - Shopify reference: `https://www.shopify.com/editions/winter2026` - Borrow editorial long-page structure, not copy.

  **Acceptance Criteria**:
  - [ ] Content model covers 5-7 homepage anchors maximum.
  - [ ] Copy keys exist consistently across `en`, `id`, and `ja`.
  - [ ] No remaining homepage CTA points to removed product pages.

  **QA Scenarios**:

  ```
  Scenario: All locales render homepage copy
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`, `/id`, and `/ja`.
      2. Assert each page has one visible `h1`.
      3. Assert each page has anchor links for the planned sections.
    Expected Result: All locales load localized homepage content without missing key errors.
    Evidence: .sisyphus/evidence/task-2-locales-homepage.png

  Scenario: Removed-page copy is not exposed as primary nav
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Inspect header and footer links.
      3. Assert there are no primary links to `/features`, `/pricing`, `/story`, `/integrations`, `/docs`, `/updates`, or `/support`.
    Expected Result: Primary navigation is anchor-based plus legal/app CTAs.
    Evidence: .sisyphus/evidence/task-2-no-removed-nav-links.txt
  ```

  **Commit**: YES
  - Message: `content(website): define single page marketing copy`
  - Files: translation files and any content model file
  - Pre-commit: `bun run --cwd apps/website typecheck`

- [ ] 3. Route inventory and legal-preserving redirect plan

  **What to do**:
  - Inventory all current routes under `apps/website/app/[locale]/`.
  - Preserve `terms` and `policy` routes.
  - Decide per removed route whether to delete route files or convert to redirects using Next.js route-level redirect patterns.
  - Map removed marketing routes to homepage anchors where sensible.

  **Must NOT do**:
  - Do not remove `terms` or `policy`.
  - Do not leave header/footer links pointing to removed routes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Route inventory and redirect plan are bounded.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T10, T12
  - **Blocked By**: None

  **References**:
  - `apps/website/app/[locale]/` - Current route folders to inventory.
  - `apps/website/navigation/nav-items.ts:1-7` - Existing nav points to routes that will no longer be primary pages.
  - `apps/website/app/[locale]/terms/` - Legal route to preserve.
  - `apps/website/app/[locale]/policy/` - Legal route to preserve.

  **Acceptance Criteria**:
  - [ ] Route plan explicitly lists preserved and removed/redirected routes.
  - [ ] `terms` and `policy` remain reachable in all locales.
  - [ ] Non-legal marketing pages do not remain as standalone marketing experiences.

  **QA Scenarios**:

  ```
  Scenario: Legal pages remain reachable
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en/terms`.
      2. Assert response/page is not a 404 and body is visible.
      3. Navigate to `/en/policy`.
      4. Assert response/page is not a 404 and body is visible.
    Expected Result: Both legal pages load successfully.
    Evidence: .sisyphus/evidence/task-3-legal-pages.png

  Scenario: Product route no longer renders standalone page
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en/features`.
      2. Assert final URL is `/en` or `/en#features` or equivalent homepage anchor.
      3. Assert homepage hero is visible.
    Expected Result: Removed route redirects/consolidates to homepage.
    Evidence: .sisyphus/evidence/task-3-route-redirect.txt
  ```

  **Commit**: NO (group with T12)

- [ ] 4. Homepage section architecture blueprint

  **What to do**:
  - Create/refactor section components into a restrained editorial sequence.
  - Recommended anchors: `#overview`, `#capture`, `#clarity`, `#ai`, `#workspaces`, `#start`.
  - Use a repeated chapter pattern: short label, strong headline, concise copy, proof visual/card, contextual CTA.
  - Ensure responsive layouts stack cleanly.

  **Must NOT do**:
  - Do not create more than 7 major anchors.
  - Do not overuse decorative effects.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Requires UI/UX structure, section rhythm, and responsive planning.
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Needed for premium minimal landing-page composition.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T8, T9
  - **Blocked By**: None

  **References**:
  - `apps/website/app/[locale]/page.tsx:117-139` - Current homepage composition to replace.
  - `apps/website/components/sections/hero.tsx:21-100` - Existing hero pattern.
  - `apps/website/components/sections/how-it-works.tsx` - Current section pattern to consolidate.
  - `apps/website/components/sections/feature-showcase.tsx` - Existing feature section source material.
  - Shopify reference - Use story-led section rhythm and anchor navigation pattern.

  **Acceptance Criteria**:
  - [ ] Homepage architecture has 5-7 sections maximum.
  - [ ] Every section has a stable `id` for anchor navigation.
  - [ ] Each section has a clear visual hierarchy on desktop and mobile.

  **QA Scenarios**:

  ```
  Scenario: Homepage anchor sections exist
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Assert selectors `#overview`, `#capture`, `#clarity`, `#ai`, `#workspaces`, and `#start` exist or match final planned anchors.
      3. Assert each section has visible heading text.
    Expected Result: All planned anchors are visible and reachable.
    Evidence: .sisyphus/evidence/task-4-anchor-sections.png

  Scenario: Mobile layout stacks without horizontal overflow
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Set viewport to 390x844.
      2. Navigate to `/en`.
      3. Assert `document.documentElement.scrollWidth <= window.innerWidth`.
    Expected Result: No horizontal overflow on mobile.
    Evidence: .sisyphus/evidence/task-4-mobile-layout.png
  ```

  **Commit**: NO (group with section implementation)

- [ ] 5. SEO/schema/sitemap consolidation plan

  **What to do**:
  - Identify SEO metadata impacted by single-page consolidation.
  - Plan updated homepage title/description/keywords for all locales.
  - Preserve legal pages in sitemap; remove or redirect old marketing URLs.
  - Keep JSON-LD focused on Organization and SoftwareApplication unless FAQ content remains visible on the page.

  **Must NOT do**:
  - Do not leave schema claiming FAQ content that is not rendered.
  - Do not keep sitemap entries for deleted standalone marketing pages unless they redirect intentionally.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SEO metadata updates are contained.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T14
  - **Blocked By**: None

  **References**:
  - `apps/website/app/[locale]/page.tsx:14-115` - Current SEO copy and JSON-LD.
  - `apps/website/lib/seo.ts` - Metadata helper patterns.
  - `apps/website/app/sitemap.ts` - Sitemap generation to update.
  - `apps/website/app/robots.ts` - Robots metadata if route handling changes.

  **Acceptance Criteria**:
  - [ ] SEO plan aligns with single-page route strategy.
  - [ ] JSON-LD references only visible or accurate content.
  - [ ] Sitemap includes homepage and preserved legal pages.

  **QA Scenarios**:

  ```
  Scenario: Homepage metadata exists
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Read `document.title` and meta description.
      3. Assert both describe Oewang as a finance tracking product, not a multi-page feature catalog.
    Expected Result: Metadata is present and aligned with single-page positioning.
    Evidence: .sisyphus/evidence/task-5-home-metadata.txt

  Scenario: JSON-LD is valid JSON
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Select `script[type="application/ld+json"]`.
      3. Parse its text with `JSON.parse`.
    Expected Result: JSON-LD parses and contains Organization/SoftwareApplication data.
    Evidence: .sisyphus/evidence/task-5-jsonld.txt
  ```

  **Commit**: NO (group with T14)

- [ ] 6. Minimal GSAP animation primitives

  **What to do**:
  - Implement small reusable animation primitives/hooks for section reveal and optional anchor-active behavior.
  - Register animation only in client components.
  - Clean up GSAP contexts/timelines on unmount.
  - Use restrained values: opacity, y translation, subtle scale, no dramatic motion.

  **Must NOT do**:
  - Do not animate layout-critical content in a way that hides it permanently.
  - Do not require paid or heavy GSAP plugins.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Requires animation implementation and UX judgment.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T13
  - **Blocked By**: T1

  **References**:
  - `apps/website/components/layout/header.tsx:1-56` - Client component state pattern.
  - `apps/website/components/providers.tsx` - Provider/client boundary context.
  - `apps/website/package.json:14-39` - Dependency context.

  **Acceptance Criteria**:
  - [ ] Animation setup is contained in one or few clearly named files.
  - [ ] `prefers-reduced-motion` branch avoids animation setup.
  - [ ] GSAP cleanup is implemented.
  - [ ] No TypeScript errors.

  **QA Scenarios**:

  ```
  Scenario: Section reveal animation does not block content
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Wait 500ms.
      3. Assert the hero heading and primary CTA are visible.
      4. Scroll to `#ai` and assert the section heading becomes visible within 2s.
    Expected Result: Content remains visible and reveal motion completes.
    Evidence: .sisyphus/evidence/task-6-section-reveal.png

  Scenario: Reduced motion keeps content static and visible
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Emulate reduced motion.
      2. Navigate to `/en#workspaces`.
      3. Assert target section is visible without animation delay.
    Expected Result: Reduced-motion users see content immediately.
    Evidence: .sisyphus/evidence/task-6-reduced-motion.png
  ```

  **Commit**: YES
  - Message: `feat(website): add minimal gsap section motion`
  - Files: scoped animation files
  - Pre-commit: `bun run --cwd apps/website typecheck`

- [ ] 7. Editorial hero and proof visual

  **What to do**:
  - Refactor `HeroSection` into a minimal editorial hero.
  - Include concise Oewang positioning, one primary CTA, one secondary anchor CTA, and a calm proof visual based on finance tracking.
  - Make hero responsive and animation-ready.

  **Must NOT do**:
  - Do not link secondary CTA to removed `/features` page.
  - Do not overfill hero with dashboards/cards.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T11, T13
  - **Blocked By**: T2, T4

  **References**:
  - `apps/website/components/sections/hero.tsx:7-102` - Existing hero component.
  - `apps/website/app/[locale]/page.tsx:124-126` - Hero usage.
  - `apps/website/lib/translations/website-en.ts:11-23` - Existing hero copy keys.

  **Acceptance Criteria**:
  - [ ] Hero has one `h1` on the page.
  - [ ] Primary CTA goes to register/dashboard depending on auth state.
  - [ ] Secondary CTA scrolls to an in-page section.
  - [ ] Hero remains visible above fold at desktop and mobile.

  **QA Scenarios**:

  ```
  Scenario: Hero primary CTA is visible and points to app auth
    Tool: Playwright
    Preconditions: Website server running, unauthenticated state.
    Steps:
      1. Navigate to `/en`.
      2. Assert one `h1` is visible.
      3. Assert primary CTA link href contains `/register`.
    Expected Result: Hero is clear and conversion CTA is present.
    Evidence: .sisyphus/evidence/task-7-hero-cta.png

  Scenario: Hero secondary CTA scrolls in-page
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Click secondary CTA with href beginning `#` or localized homepage anchor.
      3. Assert target section is visible.
    Expected Result: Secondary CTA does not navigate to removed pages.
    Evidence: .sisyphus/evidence/task-7-hero-anchor.txt
  ```

  **Commit**: NO (group with T13)

- [ ] 8. Anchor-based header/navigation

  **What to do**:
  - Replace mega-menu/multi-page navigation with compact sticky anchor navigation.
  - Keep brand link, section anchors, language handling if appropriate, and auth/dashboard CTA.
  - Ensure mobile menu uses anchor links and closes after selection.

  **Must NOT do**:
  - Do not keep links to removed marketing pages.
  - Do not keep large mega-menu behavior.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12, T13
  - **Blocked By**: T3, T4

  **References**:
  - `apps/website/components/layout/header.tsx:42-349` - Current header to simplify.
  - `apps/website/navigation/nav-items.ts:1-7` - Existing route nav to replace with anchors.
  - `apps/website/lib/translations/website-en.ts:2-10` - Nav copy keys.

  **Acceptance Criteria**:
  - [ ] Header has no mega-menu state or panels.
  - [ ] Desktop links target homepage anchors.
  - [ ] Mobile menu opens/closes and anchor click closes it.
  - [ ] Auth CTA remains functional.

  **QA Scenarios**:

  ```
  Scenario: Desktop anchor navigation scrolls to section
    Tool: Playwright
    Preconditions: Website server running at desktop viewport.
    Steps:
      1. Navigate to `/en`.
      2. Click header link for the AI or clarity section.
      3. Assert final URL includes a hash or target section is in viewport.
    Expected Result: Navigation stays on homepage and scrolls to section.
    Evidence: .sisyphus/evidence/task-8-desktop-anchor.png

  Scenario: Mobile menu closes after anchor click
    Tool: Playwright
    Preconditions: Website server running at 390x844 viewport.
    Steps:
      1. Navigate to `/en`.
      2. Click button with accessible name `Open menu`.
      3. Click an anchor item.
      4. Assert menu panel is hidden and target section is visible.
    Expected Result: Mobile nav works without stale overlay.
    Evidence: .sisyphus/evidence/task-8-mobile-menu.png
  ```

  **Commit**: NO (group with T13)

- [ ] 9. Narrative sections and feature proof modules

  **What to do**:
  - Consolidate existing `HowItWorksSection`, `FeatureShowcases`, stats/testimonial/CTA ideas into homepage sections.
  - Use a minimal Shopify-inspired chapter rhythm: chapter label, headline, short proof, visual/card.
  - Include Oewang-specific story: daily capture, transaction clarity, AI categorization/assistant, workspaces, and start CTA.

  **Must NOT do**:
  - Do not build product functionality.
  - Do not add too many repeated cards.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T11, T13
  - **Blocked By**: T2, T4, T6

  **References**:
  - `apps/website/components/sections/how-it-works.tsx` - Existing “how it works” material.
  - `apps/website/components/sections/feature-showcase.tsx` - Current feature proof material.
  - `apps/website/components/sections/cta-section.tsx` - Existing final CTA material.
  - `apps/website/components/sections/stats.tsx` and `testimonials.tsx` - Optional proof patterns if already used.

  **Acceptance Criteria**:
  - [ ] Sections are single-page anchors and not standalone route dependencies.
  - [ ] Each section has localized copy keys.
  - [ ] Visuals are lightweight CSS/HTML, not heavy media unless already available.
  - [ ] Motion classes/hooks are applied consistently.

  **QA Scenarios**:

  ```
  Scenario: Narrative sections render in order
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Collect visible section IDs in document order.
      3. Assert hero/overview appears before capture, clarity, AI, workspaces, and start.
    Expected Result: Page follows planned story order.
    Evidence: .sisyphus/evidence/task-9-section-order.txt

  Scenario: Section cards remain readable on mobile
    Tool: Playwright
    Preconditions: Website server running at 390x844 viewport.
    Steps:
      1. Navigate to `/en`.
      2. Scroll through all sections.
      3. Assert no card text overlaps and each section heading is visible.
    Expected Result: Mobile content is readable and minimal.
    Evidence: .sisyphus/evidence/task-9-mobile-sections.png
  ```

  **Commit**: NO (group with T13)

- [ ] 10. Minimal footer and language/legal controls

  **What to do**:
  - Simplify footer to brand note, language switcher, theme toggle if retained, legal links, and app/social links if desired.
  - Remove product/company/resource link groups that point to removed pages.
  - Preserve locale switching behavior.

  **Must NOT do**:
  - Do not remove legal links.
  - Do not link to deleted routes.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T11, T13
  - **Blocked By**: T3

  **References**:
  - `apps/website/components/layout/footer.tsx:13-163` - Current footer groups and language/theme logic.
  - `apps/website/lib/translations/website-en.ts:138-143` - Footer copy keys.

  **Acceptance Criteria**:
  - [ ] Footer has visible `Terms` and `Privacy`/`Policy` links.
  - [ ] Footer has no links to removed marketing pages.
  - [ ] Language links preserve current path or return safely to locale home/legal route.

  **QA Scenarios**:

  ```
  Scenario: Footer legal links work
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Click footer Terms link.
      3. Assert URL includes `/en/terms` and page body is visible.
      4. Return and click Privacy/Policy link.
      5. Assert URL includes `/en/policy` and page body is visible.
    Expected Result: Legal links remain functional.
    Evidence: .sisyphus/evidence/task-10-footer-legal.png

  Scenario: Footer has no removed marketing links
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Query footer anchors.
      3. Assert none have hrefs ending `/features`, `/pricing`, `/story`, `/integrations`, `/docs`, `/support`, `/updates`.
    Expected Result: Footer is single-page/legal-only.
    Evidence: .sisyphus/evidence/task-10-footer-links.txt
  ```

  **Commit**: NO (group with T13)

- [ ] 11. Locale dictionary updates

  **What to do**:
  - Update `website-en.ts`, `website-id.ts`, and `website-ja.ts` to match new single-page sections.
  - Remove unused route/page copy only if it is no longer referenced.
  - Ensure TypeScript type inference from `websiteEn` remains compatible.

  **Must NOT do**:
  - Do not leave missing keys in `id` or `ja`.
  - Do not hardcode user-facing strings in components.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T13, T18
  - **Blocked By**: T2, T7, T9, T10

  **References**:
  - `apps/website/lib/translations/index.ts` - Dictionary export/loading pattern.
  - `apps/website/lib/translations/website-en.ts:1-159` - Source type shape.
  - `apps/website/lib/translations/website-id.ts` - Indonesian dictionary.
  - `apps/website/lib/translations/website-ja.ts` - Japanese dictionary.

  **Acceptance Criteria**:
  - [ ] No homepage component contains hardcoded user-facing marketing copy except brand/product terms.
  - [ ] `website-id.ts` and `website-ja.ts` have matching key structure to `website-en.ts`.
  - [ ] `bun run --cwd apps/website typecheck` passes.

  **QA Scenarios**:

  ```
  Scenario: Locale dictionaries do not break rendering
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`, `/id`, `/ja`.
      2. Assert each page shows localized nav/header content.
      3. Assert no literal `undefined` appears in body text.
    Expected Result: All locales render complete content.
    Evidence: .sisyphus/evidence/task-11-localized-render.png

  Scenario: TypeScript catches no dictionary shape errors
    Tool: Bash
    Preconditions: Repo root.
    Steps:
      1. Run `bun run --cwd apps/website typecheck`.
    Expected Result: Exit code 0.
    Evidence: .sisyphus/evidence/task-11-typecheck.txt
  ```

  **Commit**: YES
  - Message: `content(website): localize single page marketing copy`
  - Files: `apps/website/lib/translations/*`
  - Pre-commit: `bun run --cwd apps/website typecheck`

- [ ] 12. Remove/redirect non-legal routes

  **What to do**:
  - Remove or redirect standalone non-legal marketing routes under `apps/website/app/[locale]/`.
  - Preserve `terms` and `policy`.
  - Use route redirects where SEO/backlink preservation matters.
  - Ensure generated routes do not produce broken imports.

  **Must NOT do**:
  - Do not delete legal pages.
  - Do not alter app/dashboard routes outside `apps/website`.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T14, T15, T17
  - **Blocked By**: T3, T8

  **References**:
  - `apps/website/app/[locale]/` - Route folders to consolidate.
  - `apps/website/app/[locale]/terms/` - Preserve.
  - `apps/website/app/[locale]/policy/` - Preserve.
  - `apps/website/navigation/nav-items.ts:1-7` - Remove or replace route nav.

  **Acceptance Criteria**:
  - [ ] Removed route list matches route inventory decisions.
  - [ ] `/en/terms` and `/en/policy` work.
  - [ ] `/en/features`, `/en/pricing`, `/en/story`, `/en/integrations`, `/en/docs`, `/en/support`, `/en/updates` redirect or no longer render standalone pages.
  - [ ] Build passes with no missing imports from removed pages.

  **QA Scenarios**:

  ```
  Scenario: Removed routes redirect to homepage
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en/pricing`.
      2. Assert final URL is `/en` or `/en#start`.
      3. Navigate to `/en/features`.
      4. Assert final URL is `/en` or `/en#overview`/`#clarity`.
    Expected Result: Former marketing pages consolidate to homepage.
    Evidence: .sisyphus/evidence/task-12-redirects.txt

  Scenario: Legal routes are not redirected away
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en/terms` and record URL.
      2. Navigate to `/en/policy` and record URL.
      3. Assert both final URLs remain legal paths.
    Expected Result: Legal routes remain standalone.
    Evidence: .sisyphus/evidence/task-12-legal-preserved.txt
  ```

  **Commit**: YES
  - Message: `refactor(website): consolidate marketing routes`
  - Files: route folders/files, navigation file
  - Pre-commit: `bun run --cwd apps/website build`

- [ ] 13. Homepage composition integration

  **What to do**:
  - Compose final homepage in `apps/website/app/[locale]/page.tsx` using refactored header, sections, motion, dictionaries, SEO, and footer.
  - Ensure server/client boundaries are correct: page remains server where possible, animations live in client components.
  - Remove obsolete imports from old homepage.

  **Must NOT do**:
  - Do not turn the full page into a client component unnecessarily.
  - Do not bypass dictionary system.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T14, T15, T16, T18
  - **Blocked By**: T6-T11

  **References**:
  - `apps/website/app/[locale]/page.tsx:60-141` - Current homepage composition.
  - `apps/website/components/layout/header.tsx` - Header integration.
  - `apps/website/components/layout/footer.tsx` - Footer integration.
  - `apps/website/components/sections/` - Section components to compose.

  **Acceptance Criteria**:
  - [ ] Homepage renders complete single-page layout in all locales.
  - [ ] No obsolete standalone-page CTAs remain.
  - [ ] Server/client boundary is minimal and type-safe.
  - [ ] `bun run --cwd apps/website build` passes.

  **QA Scenarios**:

  ```
  Scenario: Full homepage renders end-to-end
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Assert header, hero, at least five sections, final CTA, and footer are visible.
      3. Take full-page screenshot.
    Expected Result: Complete homepage renders without runtime errors.
    Evidence: .sisyphus/evidence/task-13-full-homepage.png

  Scenario: No console errors during homepage load
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Attach console error listener.
      2. Navigate to `/en`.
      3. Scroll to bottom.
      4. Assert zero browser console errors.
    Expected Result: No runtime console errors.
    Evidence: .sisyphus/evidence/task-13-console-errors.txt
  ```

  **Commit**: YES
  - Message: `refactor(website): compose minimal single page homepage`
  - Files: homepage, layout, sections
  - Pre-commit: `bun run --cwd apps/website build`

- [ ] 14. SEO/schema/sitemap updates

  **What to do**:
  - Update homepage metadata for single-page positioning across locales.
  - Ensure JSON-LD reflects visible content and accurate product info.
  - Update sitemap to include localized home and legal routes only, plus any intentional redirect handling.
  - Update robots only if needed.

  **Must NOT do**:
  - Do not keep obsolete feature/pricing/story URLs in sitemap as standalone pages.
  - Do not emit invalid JSON-LD.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T15, T17
  - **Blocked By**: T5, T12, T13

  **References**:
  - `apps/website/app/[locale]/page.tsx:14-115` - Current SEO and JSON-LD.
  - `apps/website/lib/seo.ts` - Metadata helper.
  - `apps/website/app/sitemap.ts` - Sitemap update target.
  - `apps/website/app/robots.ts` - Robots update target if needed.

  **Acceptance Criteria**:
  - [ ] Metadata title/description are updated for new homepage.
  - [ ] JSON-LD parses and is accurate.
  - [ ] Sitemap excludes removed standalone marketing routes.
  - [ ] Legal routes remain indexed/reachable unless project policy says otherwise.

  **QA Scenarios**:

  ```
  Scenario: Sitemap excludes removed pages
    Tool: Bash
    Preconditions: Website build/start or direct route available.
    Steps:
      1. Fetch or inspect generated sitemap output.
      2. Assert it does not include `/features`, `/pricing`, `/story`, `/integrations`, `/docs`, `/support`, or `/updates` as standalone URLs.
      3. Assert it includes home, terms, and policy for supported locales.
    Expected Result: Sitemap matches single-page/legal-only route strategy.
    Evidence: .sisyphus/evidence/task-14-sitemap.txt

  Scenario: JSON-LD parses on homepage
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Parse all `application/ld+json` scripts.
      3. Assert no parse errors.
    Expected Result: Structured data is valid JSON.
    Evidence: .sisyphus/evidence/task-14-jsonld.txt
  ```

  **Commit**: YES
  - Message: `seo(website): align metadata with single page marketing`
  - Files: SEO/sitemap/page metadata files
  - Pre-commit: `bun run --cwd apps/website build`

- [ ] 15. Playwright E2E updates

  **What to do**:
  - Replace the minimal smoke test with meaningful SPA tests.
  - Cover homepage load, anchor navigation, mobile menu, legal pages, removed route redirects, locale rendering, and CTA hrefs.
  - Keep tests deterministic and avoid visual snapshot fragility unless needed.

  **Must NOT do**:
  - Do not require manual browser inspection.
  - Do not make tests depend on external network calls beyond local app startup.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: E2E tests require routing, locale, and UI interaction coverage.
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T17, Final QA
  - **Blocked By**: T12-T14

  **References**:
  - `apps/website/e2e/home.spec.ts:1-7` - Existing smoke test to expand.
  - `apps/website/playwright.config.ts:7-20` - Existing web server and base URL config.
  - `docs/TESTING_E2E.md` - Repo E2E testing conventions.

  **Acceptance Criteria**:
  - [ ] E2E tests verify all key single-page behavior.
  - [ ] Tests include at least one negative/redirect case.
  - [ ] `bun run --cwd apps/website test:e2e` passes.

  **QA Scenarios**:

  ```
  Scenario: E2E suite passes
    Tool: Bash
    Preconditions: Dependencies installed.
    Steps:
      1. Run `bun run --cwd apps/website test:e2e`.
      2. Capture full command output.
    Expected Result: Playwright exits 0.
    Evidence: .sisyphus/evidence/task-15-e2e-output.txt

  Scenario: Redirect test catches removed page
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Run the specific Playwright test for `/en/features` or `/en/pricing` redirect behavior.
      2. Assert it validates final homepage/anchor URL.
    Expected Result: Removed route behavior is automated.
    Evidence: .sisyphus/evidence/task-15-redirect-test.txt
  ```

  **Commit**: YES
  - Message: `test(website): cover single page marketing experience`
  - Files: `apps/website/e2e/home.spec.ts`, testing docs if required
  - Pre-commit: `bun run --cwd apps/website test:e2e`

- [ ] 16. Accessibility, reduced-motion, and performance pass

  **What to do**:
  - Verify heading order, landmarks, keyboard nav, focus states, mobile menu accessibility, color contrast, and reduced motion.
  - Check animation does not cause layout shifts or hide content.
  - Keep media/visual effects lightweight.

  **Must NOT do**:
  - Do not add animations that violate reduced-motion preference.
  - Do not sacrifice keyboard accessibility for visual polish.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: T17
  - **Blocked By**: T13

  **References**:
  - `apps/website/components/layout/header.tsx` - Mobile/menu accessibility.
  - `apps/website/components/sections/` - Section headings and animation targets.
  - `apps/website/playwright.config.ts` - Browser verification setup.

  **Acceptance Criteria**:
  - [ ] Header/mobile menu is keyboard operable.
  - [ ] Reduced-motion mode shows all content with no reliance on animation.
  - [ ] Page has one `h1` and logical heading order.
  - [ ] No horizontal overflow on mobile.

  **QA Scenarios**:

  ```
  Scenario: Keyboard can operate mobile menu
    Tool: Playwright
    Preconditions: Website server running at mobile viewport.
    Steps:
      1. Navigate to `/en`.
      2. Use keyboard Tab to focus menu button.
      3. Press Enter.
      4. Assert menu opens and anchor links are focusable.
      5. Activate an anchor and assert menu closes.
    Expected Result: Mobile nav is keyboard-accessible.
    Evidence: .sisyphus/evidence/task-16-keyboard-menu.txt

  Scenario: Heading order is valid enough for landing page
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Evaluate all `h1,h2,h3` text and levels.
      3. Assert exactly one `h1` and no skipped critical section headings.
    Expected Result: Heading hierarchy is coherent.
    Evidence: .sisyphus/evidence/task-16-heading-order.txt
  ```

  **Commit**: NO (group with T17)

- [ ] 17. Build/typecheck/lint fixes

  **What to do**:
  - Run website build, typecheck, lint, and E2E.
  - Fix any issues introduced by route removal, dictionary changes, GSAP imports, or component refactors.
  - Remove unused imports/components only if no longer referenced.

  **Must NOT do**:
  - Do not suppress errors with `any`, `@ts-ignore`, or broad lint disables.
  - Do not fix unrelated repo-wide issues outside `apps/website` unless necessary for commands.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Final QA
  - **Blocked By**: T12-T16

  **References**:
  - `apps/website/package.json:5-12` - Verification scripts.
  - `apps/website/tsconfig.json` - TypeScript context.
  - `apps/website/biome.json` - Lint config.

  **Acceptance Criteria**:
  - [ ] `bun run --cwd apps/website build` passes.
  - [ ] `bun run --cwd apps/website typecheck` passes.
  - [ ] `bun run --cwd apps/website lint` passes.
  - [ ] `bun run --cwd apps/website test:e2e` passes.

  **QA Scenarios**:

  ```
  Scenario: Website verification commands pass
    Tool: Bash
    Preconditions: Repo root.
    Steps:
      1. Run `bun run --cwd apps/website typecheck`.
      2. Run `bun run --cwd apps/website lint`.
      3. Run `bun run --cwd apps/website build`.
      4. Run `bun run --cwd apps/website test:e2e`.
    Expected Result: All commands exit 0.
    Evidence: .sisyphus/evidence/task-17-verification-commands.txt

  Scenario: No forbidden TypeScript suppressions introduced
    Tool: Bash
    Preconditions: Repo root.
    Steps:
      1. Search changed website files for `@ts-ignore`, `as any`, and `console.log`.
      2. Assert none are present unless pre-existing and unrelated.
    Expected Result: No AI-slop suppressions introduced.
    Evidence: .sisyphus/evidence/task-17-no-suppressions.txt
  ```

  **Commit**: YES
  - Message: `chore(website): harden single page marketing build`
  - Files: any fixes in `apps/website`
  - Pre-commit: all website verification commands

- [ ] 18. Cross-locale final polish

  **What to do**:
  - Review `en`, `id`, and `ja` homepage copy visually for obvious truncation, awkward line breaks, and missing strings.
  - Adjust localized copy lengths to fit minimal design.
  - Verify language switcher works on home and preserved legal pages.

  **Must NOT do**:
  - Do not remove locales.
  - Do not hardcode English fallback into localized UI.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: Final QA
  - **Blocked By**: T11, T13, T15

  **References**:
  - `apps/website/lib/translations/website-en.ts`
  - `apps/website/lib/translations/website-id.ts`
  - `apps/website/lib/translations/website-ja.ts`
  - `apps/website/components/layout/footer.tsx:42-63` - Language switcher pattern.

  **Acceptance Criteria**:
  - [ ] `/en`, `/id`, `/ja` homepages render complete localized content.
  - [ ] Language switcher works from homepage.
  - [ ] Language switcher works from `terms` and `policy` or safely routes to locale equivalent.

  **QA Scenarios**:

  ```
  Scenario: Language switcher changes homepage locale
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en`.
      2. Click footer language option `ID`.
      3. Assert URL starts with `/id` and body is visible.
      4. Click `JP`.
      5. Assert URL starts with `/ja` and body is visible.
    Expected Result: Locale switching works on homepage.
    Evidence: .sisyphus/evidence/task-18-home-locale-switch.png

  Scenario: Legal page language switch remains safe
    Tool: Playwright
    Preconditions: Website server running.
    Steps:
      1. Navigate to `/en/terms`.
      2. Click language option `ID`.
      3. Assert final URL is `/id/terms` or another valid localized legal fallback.
    Expected Result: Legal localization does not 404.
    Evidence: .sisyphus/evidence/task-18-legal-locale-switch.txt
  ```

  **Commit**: YES
  - Message: `content(website): polish localized marketing page`
  - Files: translation/content files
  - Pre-commit: `bun run --cwd apps/website test:e2e`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read this plan end-to-end. For each Must Have, verify implementation exists. For each Must NOT Have, search codebase for forbidden patterns. Verify evidence files exist in `.sisyphus/evidence/`. Confirm legal routes are preserved and other marketing pages are removed/redirected.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `bun run --cwd apps/website typecheck`, `lint`, `build`, and `test:e2e`. Review changed files for `as any`, `@ts-ignore`, empty catches, `console.log`, unused imports, excessive comments, over-abstraction, and unnecessary client components.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright`
  Start from clean state. Execute every QA scenario from every task. Test homepage, anchors, mobile menu, reduced motion, locale switching, legal pages, redirects, and final CTA flows. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  Compare actual diff against this plan. Verify only `apps/website` and dependency lockfiles were changed. Confirm no `apps/app`, `apps/api`, database, auth, payment, or dashboard scope creep. Confirm Shopify reference was used for structure only, not copied content/assets.
  Output: `Tasks [N/N compliant] | Scope [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1/T6**: `feat(website): add minimal gsap motion foundation`
- **T2/T11/T18**: `content(website): localize single page marketing copy`
- **T8/T9/T10/T13**: `refactor(website): compose minimal single page homepage`
- **T12**: `refactor(website): consolidate marketing routes`
- **T14**: `seo(website): align metadata with single page marketing`
- **T15**: `test(website): cover single page marketing experience`
- **T17**: `chore(website): harden single page marketing build`

---

## Success Criteria

### Verification Commands
```bash
bun run --cwd apps/website typecheck  # Expected: exit 0
bun run --cwd apps/website lint       # Expected: exit 0
bun run --cwd apps/website build      # Expected: exit 0
bun run --cwd apps/website test:e2e   # Expected: exit 0
```

### Final Checklist
- [ ] Homepage is a single-page editorial marketing experience.
- [ ] GSAP is installed and motion is minimal, scoped, and reduced-motion safe.
- [ ] Header/footer use anchors/legal/app links only.
- [ ] `terms` and `policy` remain reachable.
- [ ] Product/resource marketing routes are removed or redirected.
- [ ] All locales render complete content.
- [ ] SEO/schema/sitemap reflect single-page strategy.
- [ ] All verification commands pass.
- [ ] Final verification agents approve and user gives explicit okay.
