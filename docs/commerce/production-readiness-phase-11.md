# Production Content & Experience Completion (Phase 11)

Status: implemented, verified to the extent this sandbox allows; **indexing strategy corrected in Phase 11R — see §5.** Last updated: 2026-09-13.

This document is the canonical record of Phase 11 — completing the customer-facing experience toward production readiness on top of Phase 10's creative/engineering foundation. It does not repeat [`premium-experience-phase-10.md`](../design/premium-experience-phase-10.md) (creative direction, the brand mark, Products Experience architecture), [`asset-manifest.md`](../design/asset-manifest.md) (asset locations/naming), or [`end-to-end-customer-commerce-readiness.md`](./end-to-end-customer-commerce-readiness.md) (cart/checkout/tracking journey audit, IDOR fixes) — those remain the source of truth for their topics; this document covers only what changed this phase and the mandated blocker/deferred classification.

---

## 1. Audit method

Per this phase's own instruction, nothing was assumed from prior docs — the actual repository was inspected first: every route under `src/app/`, every component under `src/ui/`, `docs/design/*`, `docs/commerce/*`, `docs/architecture/*`, `prisma/seed.ts` (to re-confirm the sample-data suffix is still present — it is), and `_reference/` (to re-confirm no real assets have arrived — none have). Full verification (typecheck, lint, `vitest run`, `next build`, the Playwright e2e suite with browsers actually installed) was run before and after every substantive change, not just once at the end.

## 2. What this phase found and fixed

### 2.1 A real, previously-open SEO gap: no canonical URLs anywhere

`design-system.md`/prior phase docs had already flagged "no canonical URLs found anywhere" as a known gap. Fixed this phase: every page with a `metadata`/`generateMetadata` export (`/`, `/shop`, `/shop/[category]`, `/product/[slug]`, `/search`, `/about`, `/contact`, `/policies/[slug]`, `/experience`, `/account`, `/checkout`, `/track`) now sets `alternates.canonical` to its own real path.

### 2.2 A real gap the sitemap's own exclusion left open (superseded — see §5)

`sitemap.ts` had always excluded `/product/[slug]` because seeded product names still carry the literal "(اسم تجريبي)" placeholder suffix — but PDP pages are fully linked from Shop/Category/Search/Home grids, so omitting them from the sitemap never stopped a crawler discovering and indexing them via those internal links. Phase 11's original fix applied a blanket `robots: {index: false, follow: true}` to every PDP, regardless of whether that specific product's data was real or placeholder — **Phase 11R found this incorrect** (a route-type-level decision standing in for what should have been a per-product content check) and replaced it; see §5 for the corrected strategy. `/search` (thin, query-driven, duplicate-prone results) keeps its `noindex` — that one was always a standard-practice utility-page decision, unrelated to the PDP content question, and is unchanged. `/account`, `/checkout`, `/track` — previously relying on `robots.ts`'s disallow list alone (a gap `design-system.md` had already flagged) — still carry page-level `robots: {index:false}`, also unchanged.

### 2.3 Two real, previously-untracked customer-journey events

`analytics.ts` had declared `view_category` and `search` as canonical event types since Phase 3, but no code anywhere ever called `track()` for them — confirmed by a full grep, not assumed. A new, minimal `ViewTracker` client component (`src/ui/primitives/view-tracker.tsx` — fires one `track()` on mount, renders nothing) now wires both from the already-server-rendered category and search pages, the same "one small client boundary" pattern `tracked-link.tsx` already established for clicks. Two genuinely new events were added (documented in `ux-specification.md` §24, matching the project's existing discipline of registering an event there before using it): `checkout_failed` (fired on both a server-rejected submission and a network failure in `checkout-flow.tsx`, so "where checkout fails" is actually measurable) and `order_tracked` (fired only on a successful `/track` lookup via the customer's own explicit search — not on the automatic re-lookup that follows a cancellation, which would have double-counted).

### 2.4 PDP: quantity selection and a mobile sticky add-to-cart bar

Both explicitly named in this phase's PDP audit section and both genuinely missing before this phase — confirmed by reading `product-actions.tsx` directly. Previously every "Add to Cart" click sent a hardcoded `quantity: 1`, forcing a customer who wanted more to add once and then adjust from the cart drawer. Now reuses the already-existing `QuantityControl` primitive (which existed in the codebase but was, until this phase, not used by either the PDP or the cart drawer — see §2.5) to let a customer choose 1–99 before adding. The sticky bar appears on mobile only, once the in-page action area scrolls out of view (`IntersectionObserver`, no scroll-position polling), and adds whatever quantity is currently selected — it does not duplicate the quantity control, keeping one source of truth. Neither addition needed the still-missing product photography or the still-excluded multi-variant picker; both were confirmed as unrelated blockers before starting.

### 2.5 A real, minor duplicate-UI cleanup

The cart drawer (`cart-drawer-content.tsx`) had its own hand-rolled +/− quantity buttons, doing exactly what the pre-existing `QuantityControl` primitive already generalizes — a real (if minor) instance of the "duplicate catalog/UI logic" this phase's brief explicitly warns against. Consolidated onto `QuantityControl` in both the cart drawer and the PDP (§2.4); behavior is unchanged (decrementing to 0 still triggers the existing removal-via-`PATCH`-quantity-0 server behavior).

## 3. What was audited and found already correct — not changed

Per this phase's own instruction not to rewrite working architecture without justification, the following were inspected directly and found to already meet the phase's own bar, so nothing was changed:

- **ERP/Website ownership boundaries** — unchanged since Phase 9.x; re-verified no client-authoritative pricing/inventory value exists anywhere (quantity selectors are UI-only inputs; the server independently re-validates at cart-add and order-confirmation, as already established).
- **Product/variant identity** — `ProductActions`/`QuickAddButton` still correctly key on `Variant.id` (`ProductCardData.primaryVariantId`, fixed in an earlier phase); re-confirmed no `productId`/`variantId` confusion was reintroduced by this phase's PDP changes.
- **COD-only payment, real shipping** — unchanged; `checkout-flow.tsx` still only offers COD (ONLINE shown, honestly disabled) and computes shipping from the real governorate-keyed `ShippingZone` lookup, not an invented flat rate.
- **The generic error boundary (`src/app/error.tsx`)** — already Arabic, non-technical, retry-capable, carries a correlation reference, never leaks a stack trace or raw status. `/shop`, `/shop/[category]`, `/product/[slug]`, `/search` deliberately still let a catalog-read failure bubble to this boundary rather than getting a bespoke per-page try/catch: unlike the homepage/`/experience` (Phase 10 fix — those pages have real brand-identity content, Hero/chapters, that has value independent of whether the catalog call succeeds), a Shop/Category/PDP/Search page **is** the catalog view — there is no independent content to preserve if that call fails, so bubbling to an already-polished, already-correct generic boundary is the right call, not a gap. Documented here explicitly so it isn't mistaken for an oversight.
- **Placeholder system** — `ImagePlaceholder` (`card`/`feature` variants), `JawaherPattern`, and `ChapterVisual` (Phase 10) already form one coherent, brand-toned placeholder language reused everywhere an image is missing; no customer-facing placeholder anywhere uses developer language ("TODO"/"IMAGE HERE") — confirmed by a full-repo grep, not assumed.
- **Content integrity** — re-confirmed directly against `prisma/seed.ts`, `about/page.tsx`, `policies/[slug]/page.tsx`, `TrustStrip`: no fabricated certifications, origins, reviews, ratings, statistics, or guarantees anywhere; every placeholder-content page says so honestly rather than inventing copy.
- **Filters/sorting** — still correctly absent from Shop/Category; the subcategory/type attribute data they'd need remains an open ERP dependency, unchanged, not something to build against a backend that doesn't support it yet.

## 4. Verification performed

- `npm run typecheck`, `npm run lint` — clean, run after every substantive change in this phase, not once at the end.
- `npx vitest run` — 167 passed (3 new, for `isSampleContent` — §5), 68 skipped (all skips are pre-existing DB-dependent integration tests; this sandbox has no reachable Postgres — reconfirmed via the same direct-connection check prior phases used). 0 failures.
- `npm run build` — clean.
- **Playwright e2e, browsers actually installed and a real production build/server exercised** — 30 of 32 passed. The 2 remaining failures are **not** Phase 11 (or Phase 10) regressions — both are `catalogService` calls throwing (rather than gracefully returning "not found") when Postgres is unreachable, a pre-existing gap in `/shop/[category]` and `/product/[slug]` dating to Phase 9.1, reconfirmed present on unmodified code via `git stash` in the prior phase and unchanged by this one (§3's "not changed" list explains why this phase deliberately left that generic-boundary behavior as-is).
- **Not performed: visual verification of the PDP's new quantity selector/sticky bar against a real, populated product.** This sandbox has no reachable Postgres instance, so every PDP request in this environment renders the generic error boundary (§3), not a real product — confirmed via a direct HTTP check during this phase, not assumed. The change was verified structurally (typecheck, lint, and direct code review of the exact data flow — a plain number state value, never a `Money` instance, crossing into a `fetch()` body) and is architecturally identical to the already-visually-verified cart-drawer quantity control (Phase 9.7/10), but was not seen rendered with real data in this environment.

## 5. Phase 11R — indexing strategy correction

Phase 11's PDP fix (§2.2) was re-opened and re-examined against the actual business architecture, not assumed correct. The finding: Phase 11 had conflated two genuinely different questions —

1. **"Should the PDP route type be indexable?"** — an SEO-architecture question. Answer: **yes.** Public Product Detail Pages are canonical, customer-facing commerce pages — the actual product the customer can buy, at a stable URL. There is no documented business requirement anywhere in this project asking that products be kept out of search, and PDPs are structurally nothing like `/account`/`/checkout`/`/track` (session-scoped, transactional, or private) or `/search` (a query-driven utility view with no fixed canonical content of its own).
2. **"Is *this specific product's current data* fit to index?"** — a content-readiness question, answered per product: the seeded catalog's names still carry the literal "(اسم تجريبي)" sample marker (`prisma/seed.ts`), and indexing a page whose own title admits it's fake would be real harm (search results showing "تمر مجدول (اسم تجريبي)" to the public) — but that's a fact about today's *data*, not a permanent property of the *route*.

Phase 11 answered question 2 and applied the answer to question 1 (blanket `noindex` on every PDP). **Corrected in Phase 11R:**

- **`src/lib/content-integrity.ts`** (new) — `isSampleContent(name)`, the one place that checks for the seed marker. A real product name (no marker) returns `false` the moment it exists in the database — nothing else needs to change when real catalog content lands.
- **`product/[slug]/page.tsx`'s `generateMetadata`** — sets `alternates.canonical` unconditionally (every PDP gets one — canonical is a URL-identity statement, not an indexing decision) and adds `robots: {index:false}` *only* when `isSampleContent(product.name)` is true for that specific product. A real product is indexable by default (no `robots` override at all — Next.js's own default is `index, follow`).
- **`sitemap.ts`** — now `async`, queries `catalogService.listAllProducts()`, and lists exactly the products for which `isSampleContent()` is false, alongside the existing static pages. A catalog-read failure (e.g. this sandbox's unreachable Postgres) degrades to the static-pages-only list rather than throwing — verified directly: `curl http://localhost:3000/sitemap.xml` against a DB-less build returned valid, well-formed XML with only the static entries, no 500.
- Added `export const dynamic = "force-dynamic"` to `sitemap.ts` — same reason `/shop` needed it (a real, changeable product list must never be baked into a build-time static sitemap); confirmed in the build output (`sitemap.xml` now shows as `ƒ` dynamic, not `○` static).

**Final, internally coherent strategy:**

| Route | Indexable? | Mechanism | Why |
|---|---|---|---|
| `/`, `/shop`, `/shop/[category]`, `/about`, `/contact`, `/policies/[slug]`, `/experience` | Yes | Default (no `robots` override) + `alternates.canonical` + listed in `sitemap.ts` | Public commercial/brand content, stable per-page canonical facts |
| `/product/[slug]` | **Yes, per product** | Default when `!isSampleContent(product.name)`; `noindex` only for that specific product otherwise. Listed in `sitemap.ts` only when indexable. `alternates.canonical` always set. | The canonical commerce surface — no blanket route-level exclusion; today's placeholder catalog data is the only thing gating it, and it self-corrects |
| `/search` | No | `robots: {index:false, follow:true}` + `alternates.canonical` to the bare `/search`, not listed in `sitemap.ts` | Thin, query-driven, duplicate-prone results — standard practice, not a content-integrity question |
| `/account`, `/checkout`, `/track` | No | `robots: {index:false, follow:false}` (page-level) **and** `robots.ts`'s `Disallow` (crawl-level) + `alternates.canonical`, not listed in `sitemap.ts` | Private/transactional/session-scoped utility pages |
| `/api/*`, `/dev/*` | No | `robots.ts`'s `Disallow` only (no customer-facing metadata to set) | Not pages at all |

**Robots/noindex is discoverability-only, never access control** — re-verified explicitly this phase: every one of the "private" routes above is *also* protected by its own real authorization mechanism from earlier phases (session-cookie-scoped cart/checkout ownership, the `assertCheckoutSessionOwnership`/`assertOrderOwnership` IDOR fixes from Phase 9.7) — `noindex`/`Disallow` only ever affect whether a search engine lists or crawls a URL, never whether a request to it succeeds. Nothing in this phase weakened, bypassed, or stood in for any existing authorization check.

**Canonical URLs** — re-verified as absolute (`metadataBase` in `layout.tsx` resolves every page's relative `alternates.canonical` string to a full URL, confirmed via direct HTTP response inspection: `rel="canonical" href="http://localhost:3000/about"`), stable (one distinct path per route, dynamic segments interpolate the real slug), and domain-correct-by-configuration (`SITE_URL` reads `NEXT_PUBLIC_SITE_URL`, which is genuinely not yet set for a production domain — confirmed by reading `.env`/`env.ts` directly — so it falls back to a local dev URL rather than a guessed production domain; deploying with the real env var set is a deployment-configuration step, not a code change).

## 6. Classification of remaining work

**A. Production blockers** — must be solved before real customer launch:
- None identified this phase that are within the Website's own control. (Payment gateway and courier/3PL integration are pre-existing, explicitly out-of-scope-for-now boundaries per the project's own architecture, not blockers this phase introduced or was asked to resolve.)

**B. Important but not blocking:**
- `/shop`, `/shop/[category]`, `/product/[slug]`, `/search` bubble a catalog-read failure to the generic error boundary instead of a page-specific "catalog unavailable" message (§3) — already non-technical and on-brand, just not maximally specific. A real polish opportunity, not a defect.
- No `select_item` (product-card-clicked) event is fired anywhere, despite being declared in `analytics.ts`'s union since Phase 3 — this phase wired the two explicitly-named gaps it found (`view_category`, `search`) plus two new ones (`checkout_failed`, `order_tracked`); `select_item` wasn't named in this phase's explicit event list and was left for a future pass rather than expanded opportunistically.
- `checkout_abandoned` (also declared since Phase 3) still has no emitting call site — reliably detecting "left mid-checkout" needs a `visibilitychange`/`beforeunload` listener that's easy to get wrong (false-positives on a successful completion's own navigation away); not attempted this phase to avoid shipping an inaccurate signal.
- A real, second `.ico` favicon (Phase 10 shipped `icon.svg`, which modern browsers use; `favicon.ico` is still Next.js's unmodified default for legacy contexts) — cosmetic, not functional.

**C. Asset dependencies** — waiting on real photography/video/logo source files, unchanged from Phase 10's own accounting (`premium-experience-phase-10.md` §7): product photography per category, packaging shots, raw-material/process photography for the Products Experience, and original logo source files if the business has them (this project's icon is a faithful redraw from the brand guideline PDF, not a traced original).

**D. Business decisions** — require a decision from the company, unchanged from prior phases: the "best seller" concept (no schema support, correctly not fabricated on the homepage), full legal/policy copy for the five policy pages and About's brand story (currently honest placeholders), and the customer-account/login system (deliberately out of scope since Phase 9.7).

**E. Future features** — intentionally deferred, not started this phase: multi-variant picker UI on the PDP, full search relevance/typeahead, a persistent multi-order "my orders" view (blocked on the account system above), payment gateway integration, courier/3PL integration.
