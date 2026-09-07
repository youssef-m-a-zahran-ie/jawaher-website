# Jawaher Al Khair — UX Decisions & Consistency Check

Records what this UX stage decided on its own authority, what remains a business decision, what's deferred as a later technical call, and the result of cross-checking [`ux-specification.md`](./ux-specification.md) and [`customer-journeys.md`](./customer-journeys.md) against the architecture and functional requirements docs.

Status: **Stage 0.8, + Phase 2 and Phase 3 consistency checks appended.** Last updated: 2026-09-07.

---

## A. UX decisions made now (no business input required)

These are interaction/layout judgment calls within the UX/product-design mandate — reversible at the design-system or implementation stage if the team disagrees, but not blocked on business input.

- Checkout is a single accordion page (not a multi-page wizard), per the recommendation already in requirements §7.
- Shop pagination uses a "load more" button, not infinite scroll.
- No auto-rotating hero carousel on Home — one static/lightly-animated hero.
- Homepage "brand story" and "Products Experience teaser" are merged into one section, not two.
- Speculative homepage sections (as-seen-in, countdown/urgency banners, newsletter interstitial popup) are rejected at launch.
- Variant selection happens via tappable chips, only on the PDP — never on the product card, never a dropdown.
- Sticky CTAs are restricted to exactly two moments: PDP add-to-cart and checkout total.
- Mobile filters/cart/menu use bottom-sheets/drawers, not full-page navigation.
- Western Arabic numerals (0–9) recommended for prices/quantities/phone numbers/SKUs.
- Recommendation copy must never claim personalization that doesn't exist at launch (curated/rule-based only).
- Destructive cart/address actions get an undo affordance rather than instant, irreversible removal.

## B. Business decisions still requiring owner input

Unchanged from [`../requirements/website-functional-requirements.md`](../requirements/website-functional-requirements.md) §25 — this stage did not resolve any of them, and none should be inferred from the UX patterns above (which are deliberately designed to support either outcome):

**Critical:** guest checkout OTP requirement · subcategory/type attributes per category · COD approval · delivery zones/fees · minimum order value.

**Important:** testimonials/reviews availability · Arabic vs. transliterated URL slugs · session/login duration · marketing consent timing · mobile bottom navigation (product decision).

**Optional:** future Buy Now · future restock notifications · future native mobile app.

## C. Technical decisions deferred to later implementation stages

Neither a UX call nor a business call — ordinary engineering judgment to make when building, not now:

- Exact skeleton-loading shimmer implementation.
- Exact debounce timing for search autocomplete.
- Exact rate-limit thresholds for OTP attempts.
- Exact breakpoint pixel values (the structural behavior is fixed in `ux-specification.md` §20; the precise px is a design-system/CSS decision).
- Exact animation durations/easing curves (the principles are fixed in `ux-specification.md` §23).

---

## Consistency check

Performed against `docs/architecture/blueprint.md`, `docs/architecture/architecture-decisions.md`, and `docs/requirements/website-functional-requirements.md`.

### Findings

1. **Mobile bottom navigation — pre-existing double classification, not a new conflict.** The requirements doc lists it both as a launch-vs-later "SHOULD HAVE" (§22) and as an "open question" (§25). This UX stage does not resolve that tension — it designs the interaction pattern (`ux-specification.md` §3/§19) so it can be built quickly once approved, but whether it ships at launch remains gated on the same open decision already on record. No action needed beyond this note.

2. **Analytics event taxonomy gap.** `blueprint.md` §14 documents only the `track()` abstraction pattern; the explicit event list that existed in the original Stage 0 discovery output was not carried into the condensed blueprint. `ux-specification.md` §24 reconstructs the minimum mapping needed for frontend implementation, reusing the original canonical event names, and introduces three new names not yet present in any canonical doc: `product_experience_chapter_viewed`, `product_experience_cta_clicked`, and `search`. **Recommendation:** fold these into `blueprint.md` §14 (or a dedicated analytics doc) once the Analytics phase begins, so the event taxonomy has one canonical home instead of living only in the UX spec.

3. **No contradictions found** between this UX layer and the approved architecture. Every UX behavior specified reads from or writes to modules already defined (Catalog projection, Cart, Checkout, Orders, Customers, Payments, Shipping) — no new page, provider assumption, data-ownership change, or ERP/Shopify dependency was introduced.

4. **No MVP scope expansion found.** Every UX area in this stage maps to an existing MUST/SHOULD/NICE/DEFER classification in the requirements doc. Where the task brief invited evaluating additional homepage sections, a wishlist icon, Buy Now, or personalized recommendations, this stage explicitly rejected or deferred them (see §A above and `ux-specification.md` §4/§6/§15) rather than silently including them.

5. **No duplicated/conflicting requirements found.** `ux-specification.md` and `customer-journeys.md` reference the functional requirements and architecture docs by section number rather than restating their substance, to avoid two documents drifting out of sync over time.

### Outcome

No blocking conflicts. One documentation gap identified (finding 2) — flagged for the Analytics phase, not fixed silently here since it would mean inventing part of the analytics architecture ahead of schedule.

---

## Phase 2 consistency check

Phase 2 (Brand + Design System + UX Implementation Foundation) built the token system and reusable UI primitives (`src/ui/primitives/`, `src/ui/commerce/`) but no real page. This check compares what was built against `ux-specification.md`, `customer-journeys.md`, and this file's §A, to the extent a primitives layer can be checked against a page-level spec.

### Findings (Phase 2)

1. **Destructive-action "undo" affordance — not yet representable, real gap.** §A above requires "destructive cart/address actions get an undo affordance rather than instant, irreversible removal." The Toast foundation shipped this phase (`src/ui/primitives/toast.tsx`) supports `title`/`description`/`variant`/`duration` but has no action-button slot — it can announce that something happened, not offer to reverse it. **Classification: engineering decision, not a business question** — the fix is additive (an optional `action: { label, onClick }` on `ToastOptions`, rendered as a button beside the dismiss ×) and doesn't touch tokens, layout, or any other primitive. Deferred to whichever phase first implements cart/address deletion, since building it now would mean guessing the exact undo semantics (how long is "undo" available? does it block the delete request or reverse it after?) ahead of that feature's real design.
2. **Sticky CTAs (PDP add-to-cart, checkout total) — correctly not built, no conflict.** §A restricts sticky CTAs to these two exact moments. Phase 2 built the `Button` primitive these CTAs will use, but not the sticky positioning itself, since that's a page-composition concern (PDP/checkout layout) rather than a component-foundation one. No gap — just noting the boundary so it isn't mistaken for an oversight.
3. **Bottom-sheet mobile pattern — representable.** §A requires filters/cart/menu to use bottom-sheets/drawers on mobile, not full-page navigation. `Drawer` (`src/ui/primitives/drawer.tsx`) is a single component usable for all three; it slides in from the reading-start edge via a logical `translate`, not a hardcoded side, and correctly mirrors under `dir="rtl"` (verified). No gap.
4. **Checkout single-accordion page — representable.** §A requires checkout as one accordion page, not a multi-page wizard. `Accordion` (`src/ui/primitives/accordion.tsx`) has a `singleOpen` mode matching the "one section open at a time" shape `ux-specification.md`'s checkout section describes. No gap.
5. **Variant selection as tappable chips — representable.** §A requires PDP variant selection via chips, never a dropdown or product-card control. `Tag` (`src/ui/primitives/tag.tsx`) is a selectable chip with `aria-pressed`, controlled via a `selected` prop — the right shape for this. Not wired into a real PDP yet (no PDP exists), so this is confirmed at the component level only, not the page level.
6. **Western Arabic numerals for prices/quantities — representable, no special handling needed.** `PriceDisplay` and `QuantityControl` render plain JS number formatting (no locale-specific numeral substitution), which already produces Western Arabic digits (0–9) by default — the recommendation in §A holds without any extra code.
7. **OTP entry UX — not yet designed, flagged forward rather than guessed.** Neither `ux-specification.md` nor this file specifies whether OTP entry is a single masked input or a 6-box segmented input (both are common patterns). Phase 2 did not build either, correctly — `Input` alone is not that pattern. Recorded here so the Storefront/Customers phase treats OTP entry as a UX decision to make, not an implementation detail to improvise silently.

### Outcome (Phase 2)

One real, actionable gap (finding 1) — small, additive, deferred to the phase that needs it rather than fixed speculatively now. No requirement was silently dropped or narrowed to fit what was built.

---

## Phase 3 consistency check

Phase 3 built the real public website shell and homepage against `ux-specification.md`, `customer-journeys.md`, and this file. Findings below are places implementation and spec needed a real decision, not restatements of what already matched cleanly.

### Findings (Phase 3)

1. **Category hover-dropdown (§3) deferred — nothing to put in it yet.** §3's desktop nav describes a hover dropdown per category. The only content it would ever hold is the subcategory/type filter set, which depends on real ERP attribute data — an open dependency (requirements §25) that predates this phase. Building an empty or fake dropdown would be worse than a plain link. **Classification: engineering decision, deferred to whichever phase gets real subcategory data** — the five categories still ship as direct, working nav links (requirements §2's own structural call), so nothing about discovery is broken in the meantime.
2. **Search ships as a dedicated `/search` page, not the inline-panel/full-screen-overlay pattern (§8).** That pattern needs autocomplete/typeahead (2-character trigger, grouped suggestions, thumbnails) — real search ranking this phase explicitly excludes. A dedicated page is a genuine, working UI shape (form → results grid → no-results state, all per §8's non-ranking rules) rather than a demo of the eventual overlay. **Classification: engineering decision, deferred** — the header's search icon already points at `/search`; swapping in the overlay later is additive, not a rebuild.
3. **PDP is foundation-level, not the full §7 spec.** No thumbnail gallery (single image), no variant chips (no real variant option data — see Phase 2's OTP-pattern-style reasoning: inventing chip labels would fabricate a product specification), no sticky add-to-cart bar. **Classification: correctly out of scope** — this phase's own brief says "Phase 3 does NOT implement the full catalog," and the DoD list never named PDP completeness. Recorded so the gap is explicit rather than discovered later.
4. **Mobile bottom tab bar — still unresolved, unchanged.** §3/§19/requirements §25's open decision is untouched by this phase. The mobile drawer pattern that *was* built (hamburger → full-screen drawer, categories under an accordion, account/login entry) is exactly §3's designed alternative and doesn't preclude adding a bottom bar later — it's a header addition, not a competing architecture.
5. **Cart drawer is the real interaction shell with no real line items — same shape as Phase 2's Toast-undo gap.** §9's drawer (line items, quantity stepper, subtotal, "إتمام الشراء") isn't buildable without real cart state, which this phase explicitly excludes. What's built — the drawer sliding from the reading-start edge, the empty state, the "متابعة التسوق" path — is genuinely the same component the Cart module will populate, not a placeholder that'll be thrown away.
6. **Undo-on-delete (Phase 2 finding, §A) — still open, still correctly deferred.** No destructive cart/address action exists yet for it to apply to.

### Outcome (Phase 3)

No UX requirement was silently narrowed or dropped. Every deferral above (findings 1–5) is either blocked on data/decisions that predate this phase, or explicitly out of this phase's scope per its own brief — none was a surprise discovered mid-build, which is exactly what the phase's own pre-implementation audit (`docs/planning/feature-completeness-audit.md`) was meant to catch in advance. — small, additive, deferred to the phase that needs it rather than fixed speculatively now. No requirement was silently dropped or narrowed to fit what was built.
