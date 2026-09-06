# Jawaher Al Khair — Website Functional Requirements

Canonical product/UX-level specification of what the website must do for the customer. Companion to [`../architecture/blueprint.md`](../architecture/blueprint.md) — does not redesign approved architecture; where a requirement touches it, this doc names which adapter/module it plugs into.

Status: **Approved, frozen ahead of Sprint 1.** Last updated: 2026-09-06.

Legend: **MUST HAVE** (launch blocker) · **SHOULD HAVE** (soon after) · **NICE TO HAVE** (optional) · **DEFER** (explicitly not now).

---

## 1. Scope

Functional/UX-level only — independent of visual identity, ERP internals, Shopify, production infrastructure, or a chosen payment/courier vendor. Those are separate audits.

## 2. Site functional map

Structural calls made here: **no standalone "all categories" index page** (five categories are direct nav items); **one shared Policy page template** for five content slugs, not five bespoke designs; **Favorites** included but as should-have, not a launch blocker.

| Page | Purpose | Priority | Key notes |
|---|---|---|---|
| Home | First impression, orientation into discovery | MUST | Hero, 5 category entries, best sellers, offers teaser, trust signals |
| Shop (all products) | Fast, filterable path to every product | MUST | Full catalog grid, filter/sort |
| Category (× 5) | Category-scoped discovery + education | MUST | See §4 |
| Product Detail Page | Where the purchase decision happens | MUST | See §5 |
| Search (overlay + results) | Fast path by name | MUST | See §3 |
| Offers (index + landing pages) | Central promotions; absorbs campaign traffic | SHOULD | Landing pages reuse the Shop grid template, not bespoke per campaign |
| Products Experience (hub + 5 chapters) | Cinematic storytelling differentiator | SHOULD | Architecturally independent — never blocks or is blocked by checkout; see §15 |
| About | Brand story and trust | MUST | Content supplied by business, not invented |
| Contact | Low-friction way to reach a human | MUST | Form + WhatsApp + phone/address |
| Cart (drawer + full page) | See §6 | MUST | |
| Checkout | See §7 | MUST | |
| Order Confirmation | Proof of order placed | MUST | Route-addressable (survives refresh) |
| Order Tracking | See §11 | MUST | |
| Customer Account (dashboard) | See §10 | SHOULD | Not required for a first purchase |
| Login / OTP | Website-owned identity | MUST | |
| Order History + Order Detail | Repeat-purchase driver, "Order Again" | SHOULD | |
| Addresses | Saved delivery details | SHOULD | |
| Favorites / Saved Items | Supports gift/repeat purchase pattern | SHOULD | Not required for a first purchase |
| Policies (1 template, 5 slugs: shipping/returns/privacy/terms/payment) | Legal/trust content | MUST | Content is a business decision, not invented |
| FAQ | Reduces support load | SHOULD | |

## 3. Product discovery

**Shop:** product card = image, name, category badge, price (compare-at struck if discounted), size/variant hint, availability badge (`ينفد قريبًا` low stock / `غير متوفر حاليًا` out of stock, card stays visible, greyed). Quick-add only on single-SKU products — multi-variant products must open the PDP to choose a variant first. Filters: category, price range, size/weight, "on offer." Sort: relevance (default for search), best-selling, price asc/desc, newest.

**Search:**
- Instant suggestions after 2+ characters against product name, category, and a manually-maintained Arabic synonym list — not full NLP stemming at launch.
- Arabic normalization (MUST, cheap, high value): normalize hamza forms (أ/إ/ا), ta-marbuta/ha (ة/ه), alef maksura/ya (ى/ي), strip diacritics/tatweel, fold singular/plural pairs via the synonym list.
- Typo tolerance (fuzzy fallback, e.g. trigram similarity): **SHOULD HAVE**, only triggers on zero exact/substring results — MVP ships on normalization + synonyms alone.
- Ranking: exact name → name-starts-with → category match → description match, best-sellers as tiebreaker. No personalization at launch.
- Empty search: recent searches (local) + category shortcuts. Zero results: `لم نجد نتائج لـ "…"` + nearest-category suggestions + best sellers — never a blank page.
- Results page: same grid/filter UI as Shop, scoped to the query.

## 4. Category experience

| Element | Universal / category-specific | Notes |
|---|---|---|
| Intro (name + description) | Universal structure, specific copy | From `_reference/content/categories/` |
| Subcategory/type filter (e.g. Medjool vs. Ajwa, sidr vs. clover honey) | Category-specific | Depends on real ERP attribute data — open question, §25 |
| Best sellers within category | Universal | Curated pre-launch, sales-based once order data exists |
| Filters & sorting, product grid, offer badges | Universal | Same mechanism as Shop, scoped |
| Educational content (sourcing/production story) | Category-specific | Website-owned rich content, supports trust (§15) |
| Link to that category's Products Experience chapter | Universal mechanism, specific destination | "شاهد القصة" |
| Related categories | NICE TO HAVE | E.g. dates → nuts gift-bundle idea |

## 5. Product Detail Page

**Core fields:** name, description, product story, image gallery, variant/size selector, price (+ compare-at), availability state, quantity stepper, Add to Cart, delivery info summary, product attributes (weight/origin/ingredients where available), related products, recommended products, share action, WhatsApp/contact action.

| Optional feature | Priority | Reasoning |
|---|---|---|
| Buy Now (skip cart) | NICE TO HAVE | Adds single-item checkout state; defer until data suggests cart-step friction |
| Frequently Bought Together | SHOULD (curated only) | Manual "complete the set" field; statistical FBT needs order volume, deferred (§13) |
| Reviews | DEFER | Needs moderation + volume; if testimonials already exist, that's static content (§15) |
| Share | MUST | Cheap; traffic is heavily social/WhatsApp-driven |
| WhatsApp/contact action | MUST | Matches existing brand customer-contact habits |

**Edge cases:** out of stock (Add to Cart disabled, no notify-me at launch) · low stock (urgency badge, still purchasable) · variant unavailable (shown disabled, not hidden) · product discontinued (soft-redirect to category, removed from sitemap/search) · price changed (re-validated and shown clearly before payment, never charged silently) · product temporarily unavailable (same as out of stock) · cart item became unavailable (flagged inline, blocks only that line).

## 6. Cart

- Drawer is the default add-to-cart response; a full `/cart` page exists for review and refresh-safety.
- Line item price is **always the current live price**, not the price at add-time, with a notice if it changed.
- Discounts itemized as a separate line, never folded into product price.
- Shipping estimate shown as soon as enough address info exists.
- Minimum order rules: not assumed — if imposed, cart shows progress toward it before enabling checkout (open question, §25).
- Save for later: **DEFER** — plain remove is enough at launch.
- Persistence: server-side, keyed to guest session or customer; **guest cart merges into account cart on login** (combine quantities per SKU); prices always re-fetched live.
- Empty cart: friendly state with a path back to Shop/best sellers.
- Out-of-stock item in cart: flagged inline, blocks only that line.

## 7. Checkout

> **Recommendation:** collapse the conceptual 7-step flow (contact → address → delivery → payment → review → confirmation) into **one accordion-style page** on mobile rather than five page loads — each extra navigation is a friction/drop-off point. Desktop can reuse the same accordion with a persistent summary sidebar.

| Field / step | Requirement |
|---|---|
| Guest vs. login | Guest checkout always available; login enables faster repeat checkout via saved addresses |
| Phone number | Required — primary identity for order lookup and delivery contact |
| OTP | Required for account creation/login. **Whether it's also required for guest orders is unresolved** — open question, §25 |
| Name | First name minimum; full name optional |
| Address | Structured: governorate/city, area/district, street, building, floor/apartment, **plus a free-text landmark/notes field** (Egyptian addressing is often informal) |
| Delivery notes | Free text, optional |
| Delivery method | Single default acceptable at launch |
| Payment method | Whichever adapters exist at launch (§8) |
| Order summary | Always visible/sticky, including delivery fee and discount, before payment |
| Coupon | Present but collapsed by default |
| Terms acceptance | Required checkbox linking to the relevant Policy page |
| Confirmation | Immediate, with order number and tracking link |

Validation: inline, field-level, on blur — not only on submit. Arabic error messages state what's wrong and how to fix it (e.g. "رقم الهاتف غير صحيح — تأكد من إدخال 11 رقمًا"), never a generic error. Phone input tolerates a leading 0 or country code. Typing is never blocked.

## 8. Payment requirements

*No provider selected — this defines what any Payment Adapter implementation must satisfy.*

| Requirement | Priority |
|---|---|
| ≥1 working payment method end-to-end (could be COD alone) | MUST |
| Payment states surfaced in plain Arabic (processing/confirmed/failed) | MUST |
| Duplicate-payment protection via idempotency key | MUST (already architected) |
| Order created immediately for COD; on confirmed capture for online payment | MUST |
| Payment retry after failure | SHOULD |
| Webhook/async confirmation | SHOULD (synchronous acceptable at launch if the gateway supports it reliably) |
| Refund visibility in order history | SHOULD |
| Partial refunds | NICE TO HAVE |
| Saved payment methods / multiple simultaneous gateways / installments | DEFER |

## 9. Shipping requirements

*No courier selected.* A manually-maintained delivery-zone/fee table can sit behind the Shipping Adapter as a "manual" provider at launch — no real courier integration required on day one.

| Requirement | Priority |
|---|---|
| Serviceability check at address entry | MUST |
| Delivery fee shown before payment (static table acceptable) | MUST |
| Estimated delivery time (even static text) | MUST |
| Order-status-driven tracking (§11) | MUST |
| COD support (if approved) | SHOULD |
| Real-time courier tracking integration | SHOULD (later, once a real courier is integrated) |
| Multiple delivery method choices | NICE TO HAVE |
| Free-shipping threshold | NICE TO HAVE |
| Failed-delivery / returned-shipment handling surfaced to customer | SHOULD |
| Delivery time-slot selection / express delivery | DEFER |

## 10. Customer account

- Registration/login: phone + OTP, no password.
- Guest-to-account conversion: single post-purchase prompt, reusing the phone already verified at checkout.
- Profile: name, phone (verified), email (optional).
- Addresses: saved list with a default flag.
- Order history + detail + "Order Again" (re-adds items, flags unavailable ones instead of silently dropping them).
- Favorites: should-have, supports the gift/repeat-purchase pattern.
- Notification preferences: opt in/out for marketing only — operational messages are never optional.
- Logout + session persistence: stays logged in across visits for a reasonable duration (exact duration unresolved, §25).

## 11. Order tracking

> Example stages (`تم استلام الطلب` / `جاري التجهيز` / `خرج للتوصيل` / `تم التوصيل`) are illustrative only — final stage names depend on studying the actual ERP operational workflow.

- Access: account order history, confirmation page/message link, and a public "تتبع طلبك" lookup (order number + phone) for guests.
- Presentation: vertical stepper/timeline, current stage highlighted, timestamps where available.
- Contact/help action always visible on this page.
- Tracking unavailable (adapter lag): last known stage + "جاري تحديث حالة الطلب", never a raw error.
- Cancelled order: cancellation stage + reason if available + refund status if paid online.
- After delivery: "تم التوصيل" + reorder prompt (+ review prompt only if a reviews feature exists).

## 12. Offers & promotions

- Discovery: nav item, Home banner, category-page badges, deep-linkable offer landing pages (reusing the Shop grid template).
- Coupon application: single field, immediate inline validation with distinct messages for invalid/expired/usage-limit-reached.
- Discount always itemized in the order summary.
- Stacking (proposed rule, business to confirm): at most one manual coupon per order; automatic ERP-defined promotions may combine with it.
- Buy X Get Y / bundles: **DEFER** — launch with simple coupons + ERP-defined promotions only.

## 13. Product recommendations

| Placement | Launch approach | Priority |
|---|---|---|
| PDP — related products | Same category or curated "recommended" flag | MUST |
| PDP — frequently bought together | Curated "complete the set" | SHOULD |
| Cart — cross-sell | Same-category curated add-ons | NICE TO HAVE |
| Home/Category — best sellers | Curated pre-launch, sales-based later | MUST |
| Order confirmation — cross-sell | Curated | NICE TO HAVE |
| Account — reorder suggestions | From order history | SHOULD |
| Recently viewed | Client-side (localStorage) | SHOULD |
| Personalized recommendations | Needs real behavioral data + engine | DEFER — not to be over-engineered pre-launch |

## 14. Products Experience — UX perspective

- Entry points: dedicated nav item, category-page "شاهد القصة" links, optional Home teaser.
- Navigation: 5-chapter selector, any category reachable directly.
- Product discovery inside: each chapter ends with a curated showcase of 3–6 products (not the full grid) — stays editorial, not a disguised shop page.
- CTA: persistent, reappearing "تسوق الآن."
- Transition back: explicit "return to Shop" after the final chapter.
- Supports conversion by building appetite/trust for high-consideration, gift-worthy purchases (dates, honey especially) — best suited to customers still discovering, never forced before checkout.
- Avoids distraction: never interstitial, always skippable, never autoplay-locks the viewport.

| Category | Storytelling objective |
|---|---|
| Dates | Provenance and freshness — "from palm to your table" |
| Honey | Purity and natural sourcing — "from flower to jar, untouched" |
| Oils | Extraction quality and purity |
| Nuts | Freshness and careful selection/roasting |
| Ghee | Traditional craft and richness |

Eventual asset needs (not produced now): per-chapter production photography/video, packaging shots, sourcing copy — belongs in `_reference/experience/<category>/`.

## 15. Trust & conversion

| Area | Requirement type | Notes |
|---|---|---|
| Product authenticity / origin | Content requirement | Must come from the business, not invented |
| Quality information | Content requirement | |
| Packaging presentation | Content + Functional (PDP gallery slot) | |
| Delivery transparency | Functional | Fee/estimate shown early, never only at the last step |
| Payment transparency | Functional | Total always visible before payment |
| Returns policy | Business decision + Functional | Policy page + checkout link |
| Contact information | Content + Functional | Must be supplied by the business |
| WhatsApp presence | Functional | PDP, Contact, Confirmation, Tracking entry points |
| Customer support channel/hours | Business decision | |
| Reviews/testimonials | Business decision (do any exist?) + Functional | Static testimonials now if available; review system deferred |
| Trust badges | Content — only if genuinely true | Never invented |

## 16. Notifications

*No channel/provider selected.*

| Event | Priority |
|---|---|
| Order confirmed | MUST |
| Payment confirmed / failed | MUST |
| Order status changed (preparing/out for delivery/delivered) | MUST |
| Order cancelled | MUST |
| Refund processed | SHOULD |
| Support reply | SHOULD |
| Marketing/promotional (opt-out respected) | SHOULD |
| Rich push notifications | DEFER — needs app or web-push infrastructure |

## 17. SEO requirements

- Home: Arabic keyword-optimized title/meta, Organization structured data.
- Category: unique title/description per category, canonical URL, breadcrumb structured data.
- Product: Product structured data (name/price/availability/image) sourced live from the catalog projection — never stale.
- Offers: canonical to underlying category if thin; `noindex` for time-limited campaign pages.
- Search results: `noindex, follow`.
- URLs: recommend transliterated Latin slugs with Arabic display titles — **flagged for confirmation, not decided** (§25).
- Sitewide: `sitemap.xml`, `robots.txt`, Open Graph/Twitter card metadata (important given WhatsApp/social share traffic).

## 18. Accessibility

Keyboard navigation for every interactive element (incl. cart drawer/modals, focus trap + Escape). Screen readers: semantic landmarks, Arabic ARIA labels, mandatory alt text per product image. Visible focus states everywhere. Color contrast WCAG AA minimum (final values depend on brand colors — external dependency). Form errors announced via `aria-live`, never color-only. RTL semantics: document `dir="rtl"`, logical CSS properties, icon mirroring only where directionally meaningful. Reduced motion honored site-wide. Touch targets ≥44×44px. Checkout errors clearly associated with their field.

## 19. Mobile-first requirements

| Area | Mobile | Desktop difference |
|---|---|---|
| Navigation | Hamburger + optional bottom tab bar | Full horizontal nav |
| Search | Full-screen overlay | Inline expanding panel |
| Product cards | 2-column grid | 4+ column grid |
| PDP | Stacked: image then info | Side-by-side gallery + info |
| Cart | Full-screen drawer | Side panel |
| Checkout | Single-column accordion | Accordion + summary sidebar |
| Account | Stacked menu | Sidebar + content |
| Tracking | Vertical timeline | Same |
| Products Experience | Fewer/simpler scenes, larger tap targets | Fuller scene richness |

## 20. Edge, error & empty states

Empty cart · no search results · product/variant unavailable · out of stock · price changed · coupon invalid/expired · payment failed/pending · network failure · checkout interrupted · order creation failed · order status unavailable · invalid/expired OTP · session expired · address invalid · delivery unavailable · unknown error.

**Principle applied throughout:** never a dead end — always a specific message and a next action (retry, alternative link, WhatsApp fallback). Full per-case behavior is detailed in §5–§11 above; nothing here should ever surface a raw error code or blank page to the customer.

## 21. Customer data requirements

| Category | Data |
|---|---|
| Required for purchase | Name (first name min), phone number, structured delivery address |
| Required for account (optional layer) | Phone (already have it), optionally full name and email |
| Optional | Email for guest confirmation, delivery notes, favorites data |
| Should NOT be collected unless justified | National ID, birthdate, gender, precise geolocation, payment card details (never touched/stored by the website), unrelated social login data |

Principle: collect only what checkout, account, and delivery genuinely require; no marketing-profile data collection at launch without explicit consent.

## 22. Launch vs. later — consolidated

**MUST HAVE:** Home, Shop, Category ×5, PDP, normalized Search, Cart, Checkout, Order Confirmation, Order Tracking, ≥1 Payment Adapter, static Shipping Adapter, About, Contact, Policies, Login/OTP.

**SHOULD HAVE:** Customer Account, Order History, Addresses, Favorites, FAQ, Offers pages, Products Experience, curated recommendations/FBT, recently viewed, fuzzy search, payment retry/refund visibility, real courier tracking, mobile bottom nav.

**NICE TO HAVE:** Buy Now, related-categories cross-links, free-shipping threshold, cart cross-sell, partial refunds, multiple delivery methods.

**DEFER:** Save for later, reviews system, statistical FBT/personalization, BOGO/bundle pricing, notify-me-on-restock, delivery time-slots/express, rich push notifications, saved payment methods, multiple simultaneous couriers/gateways.

## 23. MVP / launch definition

**In:** Home (minimal), Shop, 5 Category pages, PDP, normalized Search, Cart, single-page accordion Checkout with guest checkout, ≥1 Payment Adapter implementation (even COD-only), a static Shipping Adapter implementation, Order Confirmation, public + account Order Tracking (plain Arabic stages), About, Contact, all 5 Policy pages, Login/OTP (available, not forced).

**Out at launch:** Favorites, reviews, statistical/personalized recommendations, Products Experience (independent — may launch same day or slightly after), fuzzy search, notify-me, BOGO/bundles, multiple couriers, self-service refunds.

This scope is architecturally compatible with the approved ERP integration strategy as-is — the catalog projection, Website Order + ERP Order Reference split, and both provider adapters are exactly what this MVP exercises.

## 24. Functional requirements traceability matrix

| ID | Requirement | Priority | Dependency |
|---|---|---|---|
| WEB-001 | Home shows category entries, best sellers, active offers | MUST | Catalog projection |
| WEB-002 | Shop grid with filter/sort | MUST | Catalog projection |
| WEB-003 | Category page with education content + PE link | MUST | Content (business-supplied) |
| WEB-004 | No standalone categories-index page | MUST | Structural decision |
| COM-001 | Search with Arabic normalization + synonym list | MUST | Catalog/search index |
| COM-002 | Fuzzy/typo fallback search | SHOULD | COM-001 |
| COM-003 | PDP with variant/size selector, live price/availability | MUST | Catalog projection |
| COM-004 | Quick-add only for single-SKU products | MUST | — |
| COM-005 | Curated related/FBT products | SHOULD | Merchandising field |
| CRT-001 | Cart drawer + full page, live price display | MUST | Cart module |
| CRT-002 | Guest cart merges into account cart on login | MUST | Customers module |
| CRT-003 | Unavailable line items flagged, blocks only that line | MUST | Catalog projection |
| CHK-001 | Single-page accordion checkout (mobile) | MUST | — |
| CHK-002 | Guest checkout without forced account creation | MUST | ADR-007 |
| CHK-003 | Structured address incl. landmark/notes field | MUST | — |
| CHK-004 | Inline field-level Arabic validation | MUST | — |
| CHK-005 | OTP verification for guest orders | SHOULD (pending decision) | §25 open question |
| PAY-001 | ≥1 payment method via Payment Adapter | MUST | ADR-009 |
| PAY-002 | Idempotent order/payment creation | MUST | Already architected |
| PAY-003 | Refund status visible to customer | SHOULD | PAY-001 |
| SHIP-001 | Serviceability check + fee/estimate before payment | MUST | ADR-010 |
| SHIP-002 | Static zone/fee table as launch Shipping Adapter | MUST | ADR-010 |
| ACC-001 | Phone + OTP login | MUST | ADR-006 |
| ACC-002 | Guest-to-account conversion prompt post-purchase | SHOULD | ACC-001 |
| ACC-003 | Order history + Order Again | SHOULD | ORD-001 |
| ACC-004 | Favorites/saved items | SHOULD | ACC-001 |
| ORD-001 | Website Order created at checkout, ERP Order Reference linked | MUST | ADR-008 |
| ORD-002 | Order Confirmation page, route-addressable | MUST | ORD-001 |
| ORD-003 | Order tracking mapped to plain Arabic stages | MUST | ERP Adapter — stages not final |
| ORD-004 | Public guest tracking lookup (order number + phone) | MUST | ORD-003 |
| OFF-001 | Coupon field with distinct invalid/expired/limit messages | MUST | Promotions module |
| OFF-002 | Offer landing pages reuse Shop grid template | SHOULD | WEB-002 |
| OFF-003 | BOGO/bundle pricing | DEFER | — |
| SEO-001 | Product structured data from live catalog projection | MUST | Catalog projection |
| SEO-002 | sitemap.xml, robots.txt, canonical URLs | MUST | — |
| SEO-003 | Transliterated Latin URL slugs | SHOULD (pending confirmation) | §25 open question |
| ACS-001 | Keyboard nav + focus states site-wide | MUST | — |
| ACS-002 | Reduced-motion parity site-wide | MUST | — |
| NOT-001 | Order/payment/status transactional messages | MUST | Notifications module — channel TBD |
| PEX-001 | Products Experience hub + 5 chapters, bidirectional links to Shop | SHOULD | WEB-003 |

## 25. Open questions

These remain genuinely open — they are **not** decided here, and must not be silently assumed by future implementation work.

**Critical**
- Should guest checkout require OTP phone verification (fraud/fake-order prevention), or stay fully unauthenticated?
- What are the real subcategory/type attributes per category (e.g. date varieties, honey sources) — depends on ERP product attribute schema.
- Is Cash on Delivery approved as a payment method at launch?
- What are the actual delivery zones and fees for the launch static shipping table?
- Does a minimum order value rule exist?

**Important**
- Do real customer testimonials/reviews already exist to seed PDP trust content?
- Arabic URL slugs or transliterated Latin slugs?
- What session/login duration should "stay logged in" use?
- Should marketing opt-in be asked at checkout, at account creation only, or not at launch at all?
- Is a persistent mobile bottom navigation bar wanted as a product decision (not just technically feasible)?

**Optional**
- Should "Buy Now" (skip cart) be considered for a later release?
- Should notify-me-when-back-in-stock be built later?
- Is a native mobile app ever planned — affects whether push notifications matter?
