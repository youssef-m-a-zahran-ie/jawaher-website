# Jawaher Al Khair — UX Decisions & Consistency Check

Records what this UX stage decided on its own authority, what remains a business decision, what's deferred as a later technical call, and the result of cross-checking [`ux-specification.md`](./ux-specification.md) and [`customer-journeys.md`](./customer-journeys.md) against the architecture and functional requirements docs.

Status: **Stage 0.8.** Last updated: 2026-09-06.

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
