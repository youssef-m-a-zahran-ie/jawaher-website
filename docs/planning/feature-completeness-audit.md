# Feature Completeness Audit — Phase 1

Purpose: catch what the previous ERP project didn't — architectural decisions or missing features discovered only after implementation had progressed. This audit classifies every common production e-commerce capability against the current planning documents, so gaps are found now, in writing, rather than during real usage.

Classification legend: **MVP** (required for launch) · **Production-required** (needed before real traffic, may land just after MVP) · **Later** (deliberately post-launch) · **Out of scope** (not part of this project) · **Open decision** (business/legal input needed) · **Already covered** (an existing doc already addresses it — cited).

Status: Stage: Phase 1, + Phase 2 frontend-implications check, + Phase 3 pre-implementation audit appended. Last updated: 2026-09-07.

**Phase 4 note:** the commerce/domain engine (catalog, inventory reservation, cart, checkout, orders, payments, shipping, promotions) got its own dedicated, much deeper audit — [`commerce-completeness-audit.md`](./commerce-completeness-audit.md) — rather than a fourth section appended here, since the brief for that phase asked for a standalone deliverable. New Finding #1 below ("inventory hold during the payment window") is resolved there, not here — see that document's §5 and §21.

---

## New findings from this audit (not previously documented)

These are genuine gaps surfaced while performing this audit — not restatements of already-tracked open questions. Each is real enough to act on before it's discovered "during real usage."

| # | Finding | Classification | Detail |
|---|---|---|---|
| 1 | ~~**Inventory hold during the payment window**~~ | **Resolved in Phase 4** (hold duration remains Open decision) | Implemented as a real, tested, concurrency-safe 15-minute soft `InventoryReservation`, created at checkout confirmation and released on failure/timeout/cancellation — see `docs/planning/commerce-completeness-audit.md` §5 and `src/modules/catalog/inventory.ts`. The 15-minute duration is still the smallest technically-safe default, not a confirmed business decision — product input on the exact duration/UX copy remains open. |
| 2 | **Returns (RMA) workflow not modeled** | Later (MVP fallback: manual/WhatsApp) | Refund *payment state* is modeled (`technical-architecture.md` §5), but the physical returns process (customer requests a return → item ships back → inspected → refund triggered) has no domain representation anywhere. Recommend: handle manually via the Contact/WhatsApp channel at MVP (consistent with the existing trust-UX pattern), and model it properly once return volume justifies self-service. |
| 3 | **Consent / privacy compliance not addressed** | Open decision, Production-required | `website-functional-requirements.md` §21 covers data minimization, but no document addresses a cookie-consent mechanism, a privacy policy's legal basis, or Egypt's Personal Data Protection Law (Law 151/2020) obligations. GA4 (analytics provider, still unconfirmed per `ux-decisions.md` §B) sending customer interaction data to a third party is exactly the kind of thing this law is concerned with. Needs legal input before the Analytics phase, not after. |
| 4 | **Tax / e-invoicing not addressed** | Open decision, Production-required | No document states whether displayed prices are tax-inclusive, or whether Egyptian Tax Authority e-invoice/e-receipt requirements apply to this business. This affects the Order/Payment domain model (an invoice number/field may be required) and should be resolved before the Commerce phase, not discovered during it. |
| 5 | **No admin/internal tooling planned** | Open decision | `technical-architecture.md` §11 names an "Admin/internal API" conceptually, but no phase in `blueprint.md` §19 builds an actual staff-facing surface for managing homepage sections, offers, content, or reviewing orders manually. Someone has to do this from day one. Recommend deciding between (a) a minimal internal admin UI as an explicit future phase, or (b) direct database/internal-script tooling for a small team at launch — either is fine, but it should be a decision, not a surprise. |
| 6 | **Backorder / partial fulfillment status** | Later, depends on ERP capability | The customer-facing order stages (`data-ownership.md` §1 Order) are `preparing → out_for_delivery → delivered`. There's no stage for "item backordered" or "partially fulfilled," which real warehouse operations often need. Depends entirely on what the ERP itself can report — cannot be resolved until ERP API capability is known (already an open item), but flagging the customer-facing *stage* gap now avoids a scramble later. |
| 7 | **Gift options not modeled** | Nice to have / Later | Multiple UX documents note dates/honey are gift-purchase categories, but no gift message, gift wrapping, or "this is a gift" checkout option exists anywhere. Worth a deliberate yes/no from the business rather than an accidental omission, given how often the brand's own positioning leans on gifting. |
| 8 | **Product video in the PDP gallery** | Nice to have / Later | `website-functional-requirements.md` §5 lists PDP media as "image gallery" only; `technical-architecture.md` §16 mentions video only in the context of Products Experience. A short product-in-hand video is common for premium food e-commerce and isn't explicitly ruled in or out — worth a deliberate call when real product photography/video is commissioned. |
| 9 | **Guest order retroactive linking** | Later, minor | When a guest later creates an account with the same verified phone (`technical-architecture.md` §7), it's not specified whether their prior guest orders (placed under the same phone, before an account existed) become visible in the new account's order history. Low-stakes but worth a one-line product decision when Account/Order History is actually built. |

---

## Full classification table

| Area | Classification | Where it's handled / notes |
|---|---|---|
| Product catalog | Already covered | `data-ownership.md` §1/§2; schema itself is Backend-phase, deliberately not built in Phase 1 |
| Variants | Already covered | Same |
| SKUs | Already covered | Same — SKU is the stable cross-entity identity |
| Inventory | Already covered | `technical-architecture.md` §3/§9 — see New Finding #1 for a gap within this area |
| Pricing | Already covered | `data-ownership.md` §1 Price; `technical-architecture.md` §13 (integer minor units) |
| Promotions | Already covered | `website-functional-requirements.md` §12; Promotions module |
| Coupons | Already covered | Same |
| Discounts | Already covered | Same |
| Cart | Already covered | `technical-architecture.md` §8 |
| Cart persistence | Already covered | Same |
| Guest checkout | Already covered | ADR-007 |
| Customer accounts | Already covered | `website-functional-requirements.md` §10 |
| OTP authentication | Already covered | ADR-006; guest-OTP requirement remains an **open decision** (already tracked) |
| Address management | Already covered | `data-ownership.md` §1 Address |
| Shipping zones | Already covered | `technical-architecture.md` §6 |
| Shipping fees | Already covered | Same |
| Payment methods | Already covered | `technical-architecture.md` §5 — actual gateway is an **open decision** (already tracked) |
| COD | Already covered | `technical-architecture.md` §5's explicit first-class COD adapter state |
| Online payment | Already covered | Same |
| Order lifecycle | Already covered | `technical-architecture.md` §9, `data-ownership.md` §1 Order |
| Order cancellation | Already covered | `technical-architecture.md` §9 |
| Refunds (payment state) | Already covered | `technical-architecture.md` §5 |
| Returns (RMA process) | **See New Finding #2** | Later |
| Order tracking | Already covered | `website-functional-requirements.md` §11 |
| Abandoned carts | Already covered | `checkout_abandoned` event, requirements §6 |
| Notifications | Already covered | Notifications module, requirements §16 |
| Transactional messages | Already covered | Same |
| SEO | Already covered | `website-functional-requirements.md` §17 |
| Metadata | Already covered | Same |
| Sitemap | Already covered | Same |
| Robots.txt | Already covered | Same |
| Structured data | Already covered | Same |
| Search | Already covered | `technical-architecture.md` §14 |
| Arabic search normalization | Already covered | Same |
| Filtering | Already covered | `website-functional-requirements.md` §3 |
| Sorting | Already covered | Same |
| Pagination | Already covered | Cursor-based, `technical-architecture.md` §11 |
| Product availability | Already covered | `data-ownership.md` §1 Inventory |
| Out-of-stock behavior | Already covered | `website-functional-requirements.md` §5/§20 |
| Media management | Already covered | `technical-architecture.md` §16 |
| Product images | Already covered | Same |
| Responsive image variants | Already covered | Next/Image, same |
| Product videos | **See New Finding #8** | Nice to have / Later |
| Analytics | Already covered | `technical-architecture.md` §17 |
| Conversion tracking | Already covered | `ux-specification.md` §24 |
| Consent / privacy | **See New Finding #3** | Open decision, production-required |
| Customer communication preferences | Already covered | `website-functional-requirements.md` §10 |
| Security (general) | Already covered | `technical-architecture.md` §12/§26 |
| Rate limiting | Already covered | Foundation shipped this phase — `src/lib/rate-limit.ts` (single-instance; Redis-backed swap is the documented upgrade path) |
| Fraud/abuse prevention | Partially covered | OTP/coupon abuse specifically covered (§12/§18); broader fraud scoring/blocklisting is **Later** |
| Idempotency | Already covered | `technical-architecture.md` §9/§10/§11; foundation's `apiSuccess`/`apiError` envelope is ready for it |
| Audit trail | Already covered | `technical-architecture.md` §13/§21 |
| Error recovery | Already covered | `technical-architecture.md` §22 |
| Observability | Already covered | Foundation shipped this phase — `src/lib/logger.ts`, request-id propagation |
| Backups | Already covered (architecturally) | `technical-architecture.md` §27; operational setup is Infrastructure-phase |
| Restore strategy | Already covered (architecturally) | Same |
| Performance | Already covered | `technical-architecture.md` §25/§28 |
| Accessibility | Already covered | `ux-specification.md` §22 |
| Mobile UX | Already covered | `ux-specification.md` §19 |
| RTL | Already covered | Foundation shipped this phase — verified in a real build (`dir="rtl"`, `lang="ar"`) |
| Localization | Already covered | Arabic-only by design (Stage 0); English/i18n is explicitly **Out of scope** unless a future business need arises |
| Currency | **Resolved this phase** | EGP confirmed current/runtime currency; Saudi Riyal is legacy brand-deck context only — see `docs/design/design-decisions.md` |
| Tax handling | **See New Finding #4** | Open decision, production-required |
| Order confirmation | Already covered | `website-functional-requirements.md` §13 (UX) / `ux-specification.md` §11 |
| Account / order history | Already covered | `website-functional-requirements.md` §10 |
| Contact forms | Already covered | `website-functional-requirements.md` §1 |
| Policies | Already covered (structure) | One shared template, requirements §2; policy *content* is an existing open business/legal decision |
| Legal pages | Already covered (structure) | Same |
| Admin requirements | **See New Finding #5** | Open decision |
| ERP synchronization | Already covered | `technical-architecture.md` §3/§4/§9 |
| ERP conflict handling | Already covered | Same — ERP always wins |
| Synchronization failures | Already covered | Retry + dead-letter, same |
| Retry strategy | Already covered | Same |
| Webhook/event handling | Already covered | Payment/Shipping webhook verification, `technical-architecture.md` §5/§12 |
| Caching | Already covered | `technical-architecture.md` §20 |
| Image optimization | Already covered | `technical-architecture.md` §16 |
| CDN strategy | Already covered | `technical-architecture.md` §18/§29 |
| Animation performance | Already covered | `blueprint.md` §17, `design-system.md` §10 |
| Reduced motion | Already covered | `ux-specification.md` §23 |
| Analytics privacy | **Folds into New Finding #3** | Open decision |

---

## How to use this document

This is not a backlog and not a schema. It exists so that, before the Backend/Commerce/ERP Integration phases start building against the domain model in `docs/architecture/data-ownership.md`, every item above has been consciously classified rather than silently assumed. New Findings #1–#9 should be reviewed by whoever authorizes the next phase; none of them block Phase 1 (Repository & Development Foundation) itself.

---

## Phase 2 frontend-implication check

Phase 2 built the design-token system and reusable UI primitives (`src/ui/primitives/`, `src/ui/commerce/`), not real pages or business logic. This check goes through the same feature list with one question: **does anything shipped this phase make a future feature harder to build than it would otherwise be?** It does not re-decide anything already classified above.

| Area | UI foundation support | Gap? |
|---|---|---|
| Catalog / product display | `ProductCardData` type + `ProductCard`, `Card`, `PriceDisplay` | None |
| Variants | `hasMultipleVariants` flag already in `ProductCardData`; `Tag` (selectable chip, `aria-pressed`) is the right shape for PDP variant selection per `ux-decisions.md` §A | None — not wired to a real PDP yet, correctly, since no PDP exists |
| Pricing | `PriceDisplay` (current + struck-through compare-at); `Money` integer-minor-units foundation from Phase 1 | None |
| Discounts / coupons | `Badge`, `Tag`, `Input` are generic enough for a coupon field/applied-discount chip | None — no coupon-specific component built, correctly, since no coupon UX is specified yet |
| Inventory states | `ProductAvailability` (`in_stock`/`low_stock`/`out_of_stock`) already mirrors `data-ownership.md`'s Inventory states, mapped to `Badge` variants | None |
| Cart | `QuantityControl`, `Drawer` (mobile bottom-sheet pattern), `Toast` (add-to-cart feedback) — exercised together in the showcase's quick-add flow | Undo-on-delete gap — see `ux-decisions.md` Phase 2 finding 1 |
| Checkout | `Accordion` (`singleOpen`) matches the single-accordion-page requirement; `Input`/`Select`/`Radio`/`Checkbox` cover form fields | None |
| COD / online payment | `Radio` is the natural fit for payment-method selection | None — no payment-specific UI built, correctly, since the gateway is still an open decision (`ux-decisions.md` §B) |
| Customer account | `Input`/`Label`/`Checkbox` cover ordinary account forms | **OTP entry pattern not designed** — flagged in `ux-decisions.md` Phase 2 finding 7, not a component gap yet since no UX pattern exists to build against |
| Addresses | Ordinary form primitives suffice | None |
| Shipping / order tracking | `Badge`, `EmptyState`, `ErrorState` are generic enough to represent whatever status set the ERP eventually exposes | None at the UI layer — the status *vocabulary* itself is New Finding #6 (Phase 1), unchanged |
| Returns / refunds | Same generic states apply | None at the UI layer — process itself is New Finding #2 (Phase 1), unchanged |
| Notifications (in-app) | `Toast` | None — email/SMS templates are outside a UI-primitive system's scope |
| Search | `Input` covers a plain search box | Autocomplete/suggestions dropdown is a distinct overlay pattern, not built — no conflict, since `ux-specification.md` doesn't request it at MVP |
| Filtering / sorting | `Checkbox` (multi-select filters), `Select` (sort), `Tag` (active-filter chips) all exist | None at the component level — the composed filter panel/sidebar layout is page-composition, not primitives, correctly deferred |
| SEO | Not a UI-primitive concern | None |
| Analytics | Not a UI-primitive concern; event-mapping already documented in `ux-specification.md` §24 | None |
| Consent / privacy | No cookie-consent banner built | Not a gap yet — this is New Finding #3 (Phase 1), an open legal decision; `Modal` is generic enough to host whatever pattern is chosen once that decision lands, so nothing built this phase blocks it |
| Accessibility | Built into every primitive (`focus-visible` rings, `aria-*`, keyboard operability, `prefers-reduced-motion`) | None |
| Responsive / mobile | Mobile-first Tailwind usage throughout; `Drawer` specifically built for the documented mobile pattern | None |
| ERP sync states visible to customers | Same generic states (`Badge`/`EmptyState`/`ErrorState`) can represent any status the ERP adapter surfaces once built | None at the UI layer |

### Outcome

No feature in the list is made harder by a Phase 2 decision. Two items carry forward as genuine, already-tracked gaps rather than new ones: the Toast undo-action slot (small, additive, deferred to the cart-deletion feature) and OTP entry UX (needs a product decision before it needs a component). Both are recorded in `docs/ux/ux-decisions.md`'s Phase 2 section, not fixed speculatively here.

---

## Phase 3 pre-implementation completeness audit

Performed before building the public website shell, per this phase's brief ("we previously had a problem in the ERP project where important features were discovered only after implementation — do not repeat that"). Classification legend for this section only, as specified by the brief: **Already supported** (a real, working piece exists after this phase) · **Needs future implementation** (structurally accommodated, not built) · **Must influence Phase 3** (changed a decision actually made this phase) · **Open decision** (unchanged from earlier phases) · **Out of scope**.

| Area | Classification | Note |
|---|---|---|
| Home | Already supported | Real homepage, `docs/ux/ux-specification.md` §4 section order |
| Shop | Already supported (foundation) | Grid of all mock products; no filter/sort UI — Needs future implementation |
| Category pages | Already supported | Intro + grid per category, `generateStaticParams` for all 5 |
| Product pages | Already supported (foundation) | PDP-lite — no real gallery/variant chips/sticky bar; full spec is Needs future implementation |
| Search | Already supported (foundation) | Dedicated page, client-independent substring match; real ranking/autocomplete is Needs future implementation |
| Filtering | Needs future implementation | Primitives exist (Phase 2 audit); no filterable real dataset yet |
| Sorting | Needs future implementation | Same reasoning |
| Product availability | Already supported | `ProductAvailability` states rendered as badges everywhere a product appears |
| Offers | Out of scope this phase | No active offer in mock data; homepage section correctly absent per its own "never shown empty" rule |
| Cart | Already supported (shell only) | Drawer + always-empty state; **Must influence Phase 3**: this is why the cart icon/drawer had to be built as a real, reusable primitive-composition now, even with no persistence behind it |
| Checkout | Out of scope this phase | Explicitly excluded by the brief |
| Customer account | Already supported (placeholder) | `/account` exists so the header/drawer entry point isn't a dead link; real auth is Needs future implementation |
| Guest checkout | Open decision | Unchanged (requirements §25) |
| OTP | Open decision | Unchanged; entry UX still undesigned (Phase 2 finding, still open) |
| Addresses | Needs future implementation | No UI yet; ordinary form primitives already cover it (Phase 2 audit) |
| Shipping | Open decision | Zones/fees unchanged (requirements §25) |
| Payment | Open decision | Gateway unchanged |
| COD | Open decision | Approval unchanged — this is why no trust-strip point claims it (see Findings below) |
| Online payment | Open decision | Unchanged |
| Order confirmation | Out of scope this phase | No real orders exist yet |
| Order tracking | Out of scope this phase | Same |
| Returns | Later (Phase 1 New Finding #2) | Unchanged |
| Refunds | Later | Unchanged |
| Contact | Already supported | Real form, real (log-only) API route — see Findings below |
| About | Already supported (partial) | Safe real content + explicitly marked pending narrative |
| Policies | Already supported (structure) | One shared template, 5 slugs, content marked pending — never fabricated |
| Privacy | Open decision (content) | Structure exists; text is a legal decision, same as Phase 1 New Finding #3 |
| Terms | Open decision (content) | Same |
| Shipping policy | Open decision (content) | Same |
| Return policy | Open decision (content) | Same |
| SEO | Already supported | Metadata, OG/Twitter, canonical via `metadataBase`, semantic HTML/heading hierarchy |
| Metadata | Already supported | Per-route `generateMetadata`/static `metadata`, title template |
| Sitemap | Already supported | `src/app/sitemap.ts` — deliberately excludes mock `/product/[slug]` URLs (see Findings) |
| Robots | Already supported | `src/app/robots.ts` |
| Structured data | Already supported (partial) | Organization/WebSite+SearchAction/BreadcrumbList real; `Product` JSON-LD deliberately not emitted against mock prices — see Findings |
| Analytics | Already supported (abstraction only) | `track()` per `blueprint.md` §14, no GA4/GTM destination wired (this phase's brief) |
| Consent | Open decision | Unchanged (Phase 1 New Finding #3); no banner built, `Modal` remains the natural host once the legal decision lands |
| Accessibility | Already supported | Skip link, landmark regions, focus-visible, `aria-live` toasts, keyboard-operable drawers |
| RTL | Already supported | Verified across header/drawers/breadcrumbs/forms |
| Mobile navigation | Already supported | Hamburger → drawer, categories under an accordion; bottom tab bar remains **Open decision** (requirements §25, ux-specification §3) |
| Error handling | Already supported | Branded `error.tsx`/`not-found.tsx`, Arabic non-technical copy |
| Loading states | Already supported | Skeletons matching real content shape (`/shop`, root fallback) |
| Empty states | Already supported | Cart, search-no-results, no-products-in-category, pending-content pages |
| Future ERP integration | Out of scope this phase | Frontend stayed fully decoupled — see Data boundary below |
| Future Website Admin integration | Out of scope this phase | Unchanged from Phase 1 New Finding #5 |

### New findings from Phase 3 (not previously documented)

These are genuine, non-obvious things discovered while implementing, not restatements of already-tracked open questions.

1. **`Money` (and any class instance) cannot cross a Server-to-Client prop boundary.** `ProductCard`'s quick-add and the PDP's Add-to-Cart both originally took the whole `ProductCardData`/a class-bearing object as a prop into a `"use client"` component — this only ever worked in Phase 2 because the dev showcase imports mock data directly inside an already-client file, never passing it *as a prop from a Server Component*. The moment real pages (Server Components) rendered these same components, `next build` failed with "Only plain objects... Classes... are not supported." **Fixed by making the client surface as small as possible and plain-data-only**: `ProductCard` now self-contains its quick-add behavior via an internal `QuickAddButton` client island that takes only `productId`/`productName`/`category` (strings), never `Money`. `ProductGrid` reverted to a plain server component. This is now the binding pattern for any future component that needs client interactivity attached to catalog data — worth a permanent rule, recorded here and in `technical-decisions.md`.
2. **`notFound()` becomes a "soft 404" (200 status + `noindex`) once a route sits under a `loading.tsx` ancestor — documented Next.js 16 behavior, not a bug.** Discovered because `/shop/[category]`, `/product/[slug]`, `/policies/[slug]`, and the dev-showcase guard all returned 200 instead of 404 for invalid params, even in dev mode. Next.js's own `notFound()` docs explain: a `loading.tsx` creates an implicit Suspense boundary, its fallback streams as an immediate 200, and the status can't change once streaming starts — Next mitigates this with an injected `<meta name="robots" content="noindex">`. Verified: the correct branded not-found UI renders and `noindex` is present in every case; only the literal status code is affected. Tests were written against the real, observable guarantee (correct UI + noindex) rather than fought against documented framework behavior. See `technical-decisions.md`'s Phase 3 section for the full explanation.
3. **`next start` does not work with `output: "standalone"` (next.config.ts, set in Phase 1) — Next.js prints an explicit warning and doesn't serve the build correctly.** This affected every E2E run's server (`playwright.config.ts`), silently, since Phase 1 — never caught before because Phase 1/2 verification happened to not exercise the specific paths this broke. Fixed properly: `scripts/prepare-standalone.mjs` (Node `fs.cpSync`, cross-platform) copies static assets into `.next/standalone/`, and `playwright.config.ts`/the root README now run `node .next/standalone/server.js` directly — the same entry point the Dockerfile already used correctly. **Must influence Phase 3** in the sense that this was a pre-existing Phase 1 gap this phase's own testing happened to surface, not something introduced by Phase 3's routes themselves.
4. **`ProductCard`'s PDP link pointed at `/products/[slug]` (plural) while this phase's canonical route is `/product/[slug]` (singular).** A latent Phase 2 bug (never exercised, since no `/product` route existed yet) — fixed to match the singular convention this phase's brief specified.
5. **`Product` JSON-LD deliberately not emitted.** The structured-data utility (`src/lib/structured-data.ts`) supports `Organization`/`WebSite`/`BreadcrumbList` — all either static or mechanically derived from real routes — but not `Product`, since every product is still mock data (`src/ui/commerce/mock-products.ts`) and, unlike an on-page "(اسم تجريبي)" label, a crawler reading JSON-LD has no way to know a price is a placeholder. Add it once a real catalog exists.

### Data boundary check

No frontend code added this phase imports `src/lib/db.ts`, Prisma, or any ERP/payment/shipping SDK. `src/app/api/v1/contact/route.ts` is the one new server-side write path, and it only validates + rate-limits + logs (no database, no external call) — consistent with `module-boundaries.md`.

### Outcome (Phase 3)

No area in the checklist is made structurally harder to build later by a Phase 3 decision. The five findings above are the real, worth-remembering discoveries from this phase — three are framework-behavior facts (findings 1–3) worth a permanent place in `technical-decisions.md` so they aren't rediscovered the hard way in a later phase, and two are small, already-fixed bugs (findings 4–5, the second being a "correctly did nothing" finding).
