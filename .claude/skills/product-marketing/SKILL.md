---
name: product-marketing
description: >-
  Product Marketing, Conversion Rate Optimization (CRO), Copywriting, Pricing, and Programmatic Growth
  skill based on coreyhaines31/marketingskills and blader/humanizer. Enforces 5-second value proposition
  clarity, evidence-backed claims, anti-AI-slop copywriting, high-converting signup/pricing flows,
  and programmatic SEO guardrails. Use when writing landing pages, copy, pricing pages, or CRO audits.
---

# Product Marketing, Copywriting & CRO Skill

Conversion copywriting, landing page optimization, and SaaS growth engineering guidelines distilled from `coreyhaines31/marketingskills` and `blader/humanizer`.

---

## 1. Diagnose Context Before Writing

1. **Check Repository Context First**: Look for `.agents/product-marketing.md`, `README.md`, or `docs/` to understand the target audience, positioning, pricing, and existing voice before asking questions.
2. **Identify the 4 Pillars**:
   - **Page Type & Single Primary Action**: Homepage, feature page, pricing page, or onboarding flow — and the **one** action the visitor should take.
   - **Target Audience & Pain**: Who is buying, what workflow is broken today, and what exact words do they use to describe the pain?
   - **Differentiation & Mechanism**: *How* does the product solve it differently from the status quo or direct competitors?
   - **Proof**: Concrete metrics, live interactive demos, customer logos, benchmarks, or verifiable outcomes.

---

## 2. Anti-AI-Slop Copywriting Rules (`humanizer`)

Never ship generic AI marketing prose. Enforce these rules on every headline, paragraph, and CTA:

1. **Ban AI Tell-Tale Structures**:
   - **Never use** *"It's not X, it's Y"* or *"No X. No Y. Just Z."* contrast clichés.
   - **Never use banned filler vocabulary**: *delve, testament, tapestry, unleash, elevate, seamless, revolutionize, game-changer, cutting-edge, empower, realm, landscape, supercharge, next-generation*.
   - **No em-dash abuse**: Prefer periods, commas, or colons over chained `—` clauses.
2. **Mechanism Over Adjectives**:
   - Bad (adjective): *"Our blazing-fast, seamless invoice AI saves you hours."*
   - Good (concrete mechanism + outcome): *"Drop a PDF receipt and get line-item GL codes matched to your chart of accounts in 3 seconds."*
3. **Supportable Claims Only**:
   - Every claim must be backed by a specific capability, number, or proof point. If a claim cannot be substantiated yet, state the concrete capability instead of inventing superlatives.

---

## 3. Conversion Rate Optimization (CRO) Hierarchy

Audit and structure marketing pages in descending order of conversion impact:

1. **5-Second Above-the-Fold Test**:
   - Within 5 seconds, a cold visitor must know: **(a) What the product is**, **(b) Who it is for**, and **(c) Why it beats their current alternative**.
   - Pair the primary headline with an **authentic product visual or interactive specimen** (never abstract stock illustrations).
2. **Action-Oriented CTAs**:
   - Replace generic labels (*"Submit"*, *"Learn More"*, *"Get Started"*) with specific value-plus-low-friction CTAs (*"Start free — no card required"*, *"Run live SEO audit"*, *"Import your first repo"*).
3. **Friction Reduction in Forms & Signup**:
   - Every extra form field reduces conversion. Ask only for what is strictly required to deliver the initial value (e.g., email or OAuth / Passkey sign-in; defer workspace configuration to post-signup onboarding).
4. **Objection Handling Near the Point of Action**:
   - Place security guarantees, cancellation policy, migration help, and FAQs directly adjacent to the pricing table and bottom CTA.

---

## 4. Pricing, Onboarding & Programmatic Growth

- **Pricing Page Architecture**:
  - Anchor tiers around a clear **value metric** (seats, active projects, or usage volume) that scales with the customer's success.
  - Highlight one recommended tier, keep feature comparison tables scannable (5–7 differentiating rows in the summary card), and state currency and billing cadence transparently.
- **Activation & Onboarding ("Aha Moment")**:
  - Never drop a new user into an empty dashboard without guidance. Provide sample/seeded data, a 3-step quickstart checklist, or an immediate import flow so the user experiences core value in their first session.
- **Programmatic SEO Guardrails**:
  - When generating `/compare/{competitor}`, `/templates/{use-case}`, or `/integrations/{tool}` pages at scale, every page **must deliver genuine standalone utility** (real interactive template, verified feature matrix, working code/schema snippet). Never publish thin keyword-swapped doorway pages.
