---
name: seo-geo
description: >-
  Technical SEO and Generative Engine Optimization (GEO / AEO) skill based on roadmap.sh/seo,
  AgriciDaniel/claude-seo, and geo-seo-claude. Enforces SSR/SSG crawlability, JSON-LD Entity Schema,
  Core Web Vitals, AI crawler management (robots.txt & llms.txt), Query Fan-Out coverage, and
  AI Citability passage structuring. Use when auditing or building websites, landing pages, docs,
  or GEO/SEO features.
---

# Technical SEO & GEO (Generative Engine Optimization) Skill

Guidelines for ranking in traditional search engines and earning citations in AI answer engines (Google AI Overviews / AI Mode, ChatGPT Search, Perplexity, Claude) based on `roadmap.sh/seo`, `claude-seo`, and `geo-seo-claude`.

---

## 1. Technical SEO & Crawler Architecture

1. **Server-Rendered HTML for Every Public Route**:
   - AI crawlers (`GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`) rarely execute complex client-side JavaScript bundles. Render all primary copy, headings, metadata, and structured data via SSR or SSG (Next.js Server Components, Astro, SvelteKit SSR).
2. **Search vs. Training Bot Controls (`robots.txt`)**:
   - Separate **AI Search/Citation crawlers** (which drive referral traffic and brand visibility) from **Model Training crawlers**:
     ```text
     # Allow Search & Answer Engine Crawlers (Required for AI Citations)
     User-agent: Googlebot
     User-agent: OAI-SearchBot
     User-agent: PerplexityBot
     User-agent: Claude-SearchBot
     Allow: /

     # Optional: Block pure LLM training crawlers if desired
     # User-agent: GPTBot
     # User-agent: Google-Extended
     # Disallow: /

     Sitemap: https://example.com/sitemap.xml
     ```
3. **Canonicalization, Sitemaps & URL Hygiene**:
   - Every indexable page must emit a self-referencing `<link rel="canonical" href="...">`.
   - Use clean, shallow, lowercase kebab-case URLs (`/features/invoice-ocr`, never `?page_id=42`).
   - Block faceted/filter query combinations from indexing or canonicalize them to the base URL.
4. **`/llms.txt` Discovery File**:
   - Provide a concise Markdown index at `https://example.com/llms.txt` (`# Brand Name`, `> One-sentence summary`, followed by categorized links with 1-line descriptions of key documentation, product, and pricing pages) so AI agents and RAG pipelines resolve authoritative URLs without hallucinating.
5. **Core Web Vitals Thresholds**:
   - **LCP (Largest Contentful Paint)** $\le 2.5\text{ s}$ (preload hero image with `fetchpriority="high"`, never lazy-load above-the-fold media).
   - **INP (Interaction to Next Paint)** $\le 200\text{ ms}$.
   - **CLS (Cumulative Layout Shift)** $\le 0.1$ (explicit `width`/`height` or `aspect-ratio` on all media and embeds).

---

## 2. Entity SEO & JSON-LD Structured Data (`schema.org`)

Search engines and LLMs resolve **entities and relationships**, not isolated keyword strings:
- Emit valid **JSON-LD (`<script type="application/ld+json">`)** on every public page matching its primary type:
  - **Homepage / Brand**: `Organization` + `WebSite` (include `sameAs` links to official GitHub, LinkedIn, X, Wikipedia/Wikidata, and Crunchbase profiles for Knowledge Graph disambiguation).
  - **SaaS / App Pages**: `SoftwareApplication` (include `applicationCategory`, `operatingSystem`, and explicit `offers` pricing).
  - **Content / Guides**: `Article` or `TechArticle` with verified `author` (`Person` with credentials/profile URL), `datePublished`, and `dateModified`.
  - **FAQs & Comparisons**: `FAQPage` and `BreadcrumbList`.
- **Rule**: Every field declared in JSON-LD **must be visibly present in the rendered HTML** to comply with Google Search Central structured data policies.

---

## 3. GEO / AEO Citability & Passage Engineering

Research on Generative Engine Optimization shows that AI answer engines preferentially extract passages that are **self-contained, fact-dense, and answer-first**:

1. **Direct Answer Blocks (First 40–60 Words)**:
   - Open every major `<h2>` / `<h3>` section with a 1–2 sentence standalone definition or direct answer (`"X is..."`, `"To configure Y, do Z..."`) before expanding into nuance.
   - Optimal extractable passage length: **130–170 words** per self-contained block.
2. **Information Gain & Primary Data**:
   - Replace vague claims (*"fast performance"*, *"many factors affect cost"*) with **quantified specifics** (*"processes 10,000 rows in 42 ms"*, *"plans start at $29/month for up to 5 seats"*).
   - Use **HTML `<table>` elements** for feature comparisons, pricing tiers, and benchmarks — LLMs and Google Featured Snippets extract semantic `<table>` rows with high fidelity.
3. **Query Fan-Out Coverage**:
   - When a user asks an AI engine a buying question (*"Best project management tool for engineering teams"*), the engine fans out into sub-queries: **pricing, security/compliance, integrations, limits, and "vs. Competitor" trade-offs**.
   - Ensure product, pricing, and comparison pages state these facts explicitly in plain HTML (never hidden behind interactive calculators or unrendered JS tabs).
4. **E-E-A-T Signals**:
   - Attribute technical claims to primary sources, benchmarks, or documentation links, and display clear last-updated timestamps.
