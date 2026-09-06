# Jawaher Al Khair — Customer Journeys

Detailed UX journey maps, companion to [`ux-specification.md`](./ux-specification.md). These expand the eight journeys already listed in [`../requirements/website-functional-requirements.md`](../requirements/website-functional-requirements.md) §6 with entry points, decisions, friction points, and success states — they do not introduce new pages or rules.

Status: **Draft for review — Stage 0.8.** Last updated: 2026-09-06.

---

## Journey A — Home → Product → Cart → Checkout → Purchase

**Entry point:** direct visit, ad/social link, or bookmark landing on Home.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Home | Which category/product looks interesting? | Hero unclear about what's being sold | Hero shows a real product image + one clear headline (§4 of UX spec) |
| 2 | Category or Shop | Filter/sort or just browse? | Too many filters upfront | Filters collapsed behind one "فلترة" control on mobile |
| 3 | PDP | Which variant/size? Is it in stock? | Unclear stock state, hidden price | Live availability + price always visible above the fold |
| 4 | Add to cart | Did it work? | No feedback | Cart drawer opens automatically with the added item confirmed |
| 5 | Cart drawer/page | Keep shopping or check out? | Forced full-page navigation | Drawer keeps browsing context; "إتمام الشراء" always visible |
| 6 | Checkout (accordion) | Guest or login? Address? Payment? | Too many steps/pages | Single accordion page, guest checkout always available |
| 7 | Payment | Provider-specific | Payment fails | Inline retry, checkout state preserved |
| 8 | Confirmation | — | Anxiety about "did it work" | Order number, tracking link, WhatsApp support immediately visible |

**Exit points:** leaving after Home (never returned), abandoning at cart (§ checkout_abandoned event), abandoning mid-checkout (same event, furthest step recorded).
**Success state:** Order Confirmation reached with a valid order number and a working tracking link.

---

## Journey B — Search → Product → Purchase

**Entry point:** header search icon, used by a customer who already knows the product name.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Search overlay | Type query | Arabic spelling variants (تمر/تمور, عسل نحل) not matching | Arabic normalization + synonym list (requirements §3) |
| 2 | Suggestions | Pick a product or category suggestion | Too many irrelevant results | Ranked: exact → starts-with → category → description |
| 3 | Search results page (if no direct pick) | Refine with filters | Zero results dead-ends the search | Zero-results state offers nearest category + best sellers |
| 4 | PDP | Same as Journey A step 3 onward | — | — |
| 5–8 | Cart → Checkout → Confirmation | Same as Journey A steps 4–8 | — | — |

**Exit points:** query returns nothing useful and the customer leaves (tracked via `search` with zero results, if instrumented).
**Success state:** same as Journey A.

---

## Journey C — Category → Product → Purchase

**Entry point:** header category dropdown, Home category tile, or a category-scoped ad link.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Category page | Learn more (education/story) or go straight to products? | Education content feels like a detour | Education is a compact intro block, not a forced read; grid is visible without scrolling past it entirely |
| 2 | Category grid | Filter by subcategory/type (open dependency, requirements §25) | Type filters missing if ERP attributes aren't ready | Grid still fully usable without type filters — they're additive, not load-bearing |
| 3 | Optional: "شاهد القصة" | Take the storytelling detour? | Getting stuck in the story instead of buying | Persistent "تسوق الآن" inside the Products Experience chapter (UX spec §16) |
| 4 | PDP → Cart → Checkout → Confirmation | Same as Journey A steps 3–8 | — | — |

**Exit points:** bouncing after the category intro without reaching the grid (suggests the intro is too long or the grid isn't visible enough).
**Success state:** same as Journey A.

---

## Journey D — Products Experience → Product → Purchase

**Entry point:** dedicated nav item, or a "شاهد القصة" link from a category page.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Products Experience hub | Pick a chapter (or land directly on one from a category link) | Chapter selector not obvious | Persistent 5-chapter selector, always visible (UX spec §16) |
| 2 | Chapter scroll sequence | Keep scrolling or shop now? | Long scroll before reaching products | Persistent "تسوق الآن" pill during the sequence, not only at the end |
| 3 | Curated product showcase | Pick one of 3–6 featured products | Showcase too narrow (customer wants to see everything) | "تسوق الآن" also links to the full category grid, not only the showcase |
| 4 | PDP → Cart → Checkout → Confirmation | Same as Journey A steps 3–8 | — | — |

**Exit points:** leaving mid-chapter without reaching a CTA (tracked via `product_experience_chapter_viewed` without a following `product_experience_cta_clicked`).
**Success state:** same as Journey A — this journey exists specifically to feed Journey A/C, not to replace them.

---

## Journey E — Order Tracking

**Entry point:** confirmation page link, an order-status notification, account order history, or the public "تتبع طلبك" entry for guests.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Tracking entry (public) | Enter order number + phone | Can't remember order number | Number is in the confirmation message/page and any notification sent |
| 2 | Tracking result | Read the current stage | Raw ERP status codes confuse the customer | Always mapped to plain Arabic stages (blueprint §8) |
| 3 | If stalled/unclear | Contact support | No visible way to ask a human | WhatsApp/contact action always visible on this specific page |
| 4 | If delivered | Reorder? | No easy path to buy again | "تم التوصيل" + reorder prompt |

**Exit points:** lookup fails (order not found vs. temporarily unavailable — distinguished per UX spec §21).
**Success state:** customer understands the current stage without needing to contact support.

---

## Journey F — Returning customer → Login → Reorder

**Entry point:** account icon on any page, for a customer who has purchased before.

| Step | Screen | Decision point | Friction risk | Mitigation |
|---|---|---|---|---|
| 1 | Login (phone) | Enter phone | Forgot which number was used | Only one identity model (phone/OTP) — no separate password to forget |
| 2 | OTP entry | Enter code | Code delayed/lost | Visible resend timer, no need to re-enter phone |
| 3 | Account home | Go to Orders | Hard to find past orders | Orders is a first-level account menu item |
| 4 | Order detail | "اطلب مرة أخرى" | An item is no longer available | Unavailable items are flagged, not silently dropped, before re-adding to cart |
| 5 | Cart (pre-filled) | Adjust and check out | Stale prices from the original order | Cart always shows current live price, with a notice if it changed since the original order |
| 6 | Checkout → Confirmation | Faster than Journey A — saved address/payment method reused | — | Saved addresses (requirements §10) remove the need to retype delivery details |

**Exit points:** abandoning at the reorder-review step if too many items became unavailable.
**Success state:** a second order placed materially faster than the first, using saved account data.
