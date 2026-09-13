# Jawaher Al Khair — UX & Customer Experience Specification

Canonical HOW-level companion to [`../requirements/website-functional-requirements.md`](../requirements/website-functional-requirements.md) (WHAT) and [`../architecture/blueprint.md`](../architecture/blueprint.md) (system shape). This document does not add pages, features, or business rules beyond what those two already define — it defines the interaction, layout-behavior, and interface rules a frontend implementation must follow.

Status: **Draft for review — Stage 0.8.** Last updated: 2026-09-06. Branding (colors/type/assets) is intentionally not decided here.

Legend: **MUST HAVE** · **SHOULD HAVE** · **NICE TO HAVE** · **DEFER** (same meaning as the requirements doc).

---

## 1. UX principles

| Principle | Interface consequence |
|---|---|
| Clarity over decoration | No visual element exists without a comprehension or action purpose; no ornament for its own sake. |
| Product-first experience | Product photography/content leads every layout; chrome (nav, UI controls) stays visually quiet. |
| Minimal friction | Fewest fields/taps/screens to reach any goal — every added step must justify itself. |
| Trust before persuasion | Reassurance (authenticity, delivery, contact) is shown before upsell/urgency messaging, never after. |
| Strong hierarchy | Exactly one primary action per screen; secondary actions are visually subordinate. |
| Arabic readability | Comfortable line length and line-height for Arabic script, never justified (fully-stretched) text. |
| Mobile-first interaction | Designed for thumb/touch first; desktop is an enhancement, not the baseline. |
| Predictable navigation | Same header/footer/patterns everywhere; checkout keeps a minimal, non-distracting header. |
| Fast path to purchase | A customer who knows what they want reaches checkout in the fewest possible screens. |
| Transparent pricing | Total cost including delivery is visible before the final step, never revealed at the last second. |
| Transparent availability | Stock state is visible before add-to-cart, never discovered after. |
| Clear delivery expectations | A delivery estimate appears as early as PDP/cart, not only at checkout. |
| Progressive disclosure | Rare/advanced fields (coupon, delivery notes) collapsed by default; core fields always visible. |
| Meaningful motion | Every animation communicates a state change or a story beat — none is decorative-only. |
| Accessibility | Usable via keyboard, screen reader, and reduced motion by default, not as an afterthought. |
| Graceful failure | Every error names what went wrong and what to do next — nothing dead-ends. |

---

## 2. Information architecture — UX layer

Purpose/priority per page is defined in requirements §2. This table adds the UX-specific columns.

| Page | Primary CTA | Secondary CTA(s) | Exit paths | Conversion role |
|---|---|---|---|---|
| Home | "تسوق الآن" → Shop/category | Explore category, view offer | Category, Shop, PDP, Offer, About | Top-of-funnel orientation |
| Shop | Add to cart / open product | Filter, sort, search | PDP, Cart | Browse → select |
| Category | Open product / "شاهد القصة" | Filter, sort | PDP, Shop, Products Experience chapter | Category-scoped browse |
| PDP | Add to cart | Share, WhatsApp, related products | Cart, related PDP, category | Decision point — highest-value page |
| Search | Open a result | Filter within results | PDP, Shop | Fast path for high-intent customers |
| Offers | Open offer / add discounted item | — | PDP, Shop | Campaign landing |
| Products Experience | "تسوق الآن" per chapter | Jump to another chapter | PDP, Category, Shop | Upper-funnel trust/appetite |
| About | Contact / Shop | — | Contact, Shop | Trust reinforcement |
| Contact | Submit form / WhatsApp | Call phone | — | Trust/support |
| Cart | Proceed to checkout | Continue shopping, remove item | Checkout, Shop | Pre-purchase commitment |
| Checkout | Place order | Edit previous step | Confirmation, Cart (back) | Conversion point |
| Order Confirmation | Track order | Continue shopping, create account | Tracking, Home | Post-purchase reassurance |
| Order Tracking | Contact support | Reorder (if delivered) | Home, PDP (reorder) | Retention/reassurance |
| Login/OTP | Verify & continue | Resend code | Account, checkout resume | Identity gate |
| Account | View orders/addresses | Logout | Order detail, Addresses | Retention hub |
| Orders (history) | Reorder | View detail | Cart (via reorder), Order detail | Retention |
| Addresses | Set default / add new | Edit/delete | Checkout (if entered from there) | Repeat-checkout speed |
| Policies | — (read) | Contact | — | Trust/legal reassurance |
| FAQ | Contact if unanswered | — | Contact | Support deflection |

---

## 3. Global navigation UX

**Desktop**
- Header is sticky; on scroll past ~80px it may compress (hide a secondary row if one exists) but logo, search, account, and cart stay reachable at all times.
- Category navigation opens as a hover dropdown with a short intent delay (~150ms) to avoid accidental triggers; click-to-open on any touch-capable device.
- Search: click expands an inline panel (not a full overlay on desktop); `Escape` closes it; focus moves to the input on open and returns to the trigger on close.
- Account/cart icons show a lightweight hover tooltip only; a hover mini-cart preview is **NICE TO HAVE**, not required at launch — keeps the header simple.

**Mobile**
- Header is always sticky: logo, hamburger, cart (with live count badge).
- Hamburger opens a full-screen drawer sliding from the reading-start side (right, in RTL): nav links, categories as an expandable accordion, account/login entry.
- Search icon opens a full-screen overlay, input auto-focused so the keyboard appears immediately — no extra tap required.
- A persistent bottom tab bar (Home/Shop/Cart/Account) is a designed pattern (see §19) but its inclusion at launch is an **open product decision**, not resolved here (requirements §25).

**Closing behavior (any drawer/overlay/modal)**
Closes on: explicit close control, tap outside, `Escape` key, or successful navigation. Focus always returns to the control that opened it.

**Keyboard/accessibility**
Logical tab order (reading-direction aware), a "skip to content" link as the first stop, focus trapped inside an open drawer/modal, `Escape` always closes the top-most overlay.

---

## 4. Homepage UX

Recommended section order — **every section must justify its existence; none is included by e-commerce-template default:**

| # | Section | Priority | Customer question answered | Notes |
|---|---|---|---|---|
| 1 | Hero | MUST | "What is this, and is it for me?" | One static (or very lightly animated) hero, one headline, one CTA — **no auto-rotating carousel** (banner-blindness, generic-template feel, and a second hidden CTA nobody clicks). |
| 2 | Categories (5 tiles) | MUST | "What do you sell?" | Direct, image-led path into each category. |
| 3 | Best sellers | MUST | "What do people actually buy?" | Curated pre-launch, sales-based once order data exists (requirements §13). |
| 4 | Trust/credibility strip | MUST | "Can I trust this store?" | Short factual row: quality line, delivery info, contact/WhatsApp — no invented badges. |
| 5 | Offers | SHOULD, conditional | "Is there a deal right now?" | Rendered only if an active offer exists; the section is entirely absent otherwise, never shown empty. |
| 6 | Story & Products Experience teaser | SHOULD | "What makes this brand different?" | **Merged into one section** — a separate "brand story" block and a separate "Products Experience teaser" would duplicate the same message on one page. |
| — | ~~Additional conversion sections~~ | **Rejected/DEFER** | — | No "as seen in" (unverifiable), no countdown/urgency banners (manipulative — see §17), no newsletter interstitial popup (friction + generic-template smell). Revisit only if the business supplies genuine content that doesn't fit elsewhere. |
| 7 | Footer | MUST | "Where's everything else?" | Full IA per blueprint/requirements. |

---

## 5. Shop + category UX

**Shop**
- Grid columns by breakpoint: 2 (mobile) / 3 (tablet) / 4–5 (desktop, capped — see §20).
- Filters/sort: a top bar on desktop; a bottom-sheet triggered by a "فلترة" button on mobile (not an inline sidebar — preserves vertical space for products).
- Loading: skeleton cards matching the final card's shape (image block + 2 text lines + price line) — never a generic spinner that causes layout jump.
- Pagination: **"عرض المزيد" (load more) button**, not true infinite scroll — infinite scroll strands customers before reaching the footer/trust content and breaks "back button restores scroll position"; a button keeps navigation predictable (principle §1).
- Empty results / zero-filter-match: nearest broader result set or best sellers, per requirements §3/§20 — never a dead end.

**Category**
- Structurally identical across all five categories: intro, best sellers, filters/sort, grid, "شاهد القصة" link, optional related-categories row.
- The only genuine per-category difference is the subcategory/type filter set (depends on real ERP attribute data — open dependency, requirements §25) and the educational-content angle (the five storytelling objectives in requirements §14). No bespoke per-category layout is introduced — keeps five categories cheap to maintain.

---

## 6. Product card UX

**Fields:** image (consistent aspect ratio across the grid), name (2-line clamp), optional 1-line descriptor (e.g. size range), price with compare-at struck through if discounted, a size/variant hint chip, an availability badge, a sale badge if discounted, a quick-add control (single-SKU products only, per requirements COM-004), and a favorite/wishlist icon — **rendered only once Favorites ships** (requirements §10 SHOULD HAVE); hidden entirely, not shown disabled, before then.

**Interactions**
- Click anywhere on the card except quick-add/wishlist → PDP.
- Hover (desktop only): subtle lift/shadow, reveals quick-add if applicable. No image-swap-on-hover carousel — marginal benefit, added complexity.
- Quick add: optimistic confirmation on the button itself ("أُضيف ✓"), cart badge increments, small toast — no navigation away from the grid.
- Unavailable product: card stays visible at reduced opacity, badge "غير متوفر حاليًا" replaces the price/action area, quick-add hidden, the card remains clickable through to the PDP.
- Variant selection never happens on the card — only the hint chip is shown; full selection is a PDP concern (§7), keeping the grid dense and fast to scan.
- Loading state: skeleton sized exactly like a populated card, to avoid layout shift when data arrives.

---

## 7. Product Detail Page UX

**Above the fold (mobile):** primary product image, name, price, availability state, compact variant selector, Add to Cart button.

**Sticky:** the Add to Cart control becomes a sticky bottom bar once the user scrolls past its initial position — reachable without scrolling back up. This is the single most important sticky element on the storefront.

**Collapsible (progressive disclosure):** description, product story/education, attributes, delivery information, and policy links live in accordions below the fold — avoids one long undifferentiated scroll.

**Variant selection:** shown as tappable chips (not a dropdown) — faster to scan/compare on mobile. Selecting a variant updates price, availability, and (where relevant) gallery inline, without a page reload; the underlying data read is the Catalog module's projection (blueprint §6), not a new integration.

**Gallery:** swipeable on mobile; a thumbnail rail on desktop.

**Related/Recommended:** a single horizontal scroll row each, below the fold — keeps the PDP focused on the current product rather than turning into a second Shop grid.

**Trust/contact:** WhatsApp and share icons live near the price, not buried at the bottom.

**Edge cases:** exactly as defined in requirements §5 — this doc adds no new PDP states.

---

## 8. Search UX

- Entry: header icon → inline panel (desktop) or full-screen overlay with auto-focused, auto-opening keyboard (mobile).
- Autocomplete after 2 characters, grouped as "منتجات" and "فئات" (max ~5 each), product suggestions show a thumbnail.
- Recent searches (local, max 5, clearable) shown on the empty state alongside category shortcuts.
- No-results: shows the query, nearest-category suggestions, and best sellers — never a blank page (requirements §3/§20).
- Loading: a lightweight inline spinner inside the suggestion panel only — never blocks the whole overlay.
- Mobile keyboard submit key reads "بحث", not a generic "Go."
- Arabic normalization, synonyms, typo tolerance, and ranking: as defined in requirements §3 — this doc adds no new search behavior beyond interaction/UI.

---

## 9. Cart UX

**Drawer:** slides from the reading-start side (right, RTL). Contents: line items (image, name, variant, quantity stepper, remove, live price), subtotal, primary CTA "إتمام الشراء", secondary "متابعة التسوق", and a friendly empty state with a path to Shop/best sellers if empty.

**Quantity changes:** optimistic UI update immediately; server revalidates in the background. If the server rejects the change (e.g. stock ran out), the UI corrects itself with a visible inline notice — never a silent, unexplained revert.

**Full cart page:** same data with more room, plus the coupon field and a shipping estimate once an address is known.

**Persistence, price-at-view, unavailable items, minimum order:** exactly as defined in requirements §6 — no new cart behavior introduced here.

---

## 10. Checkout UX

Single-page accordion (per requirements §7's recommendation), one step open at a time; completed steps collapse to a compact summary row with a "تعديل" edit link.

| # | Step | Behavior |
|---|---|---|
| 1 | Contact | Phone number entry. If the open guest-OTP decision (requirements §25) resolves to "required," this step extends with an OTP sub-step using the pattern in §13 below; if it resolves to "not required," the step ends after phone entry. The UX supports both outcomes without deciding between them. |
| 2 | Delivery address | Saved-address picker if logged in with addresses on file; otherwise the structured form from requirements §7 (incl. the landmark/notes field). |
| 3 | Delivery method / fee | Computed fee and estimate shown immediately once the address is valid. |
| 4 | Payment | Method selector, reflecting whichever Payment Adapter(s) are configured (blueprint §10) — no method is hard-coded in the UI. |
| 5 | Review | Final summary of items, address, delivery, payment, and total; the coupon field lives here, collapsed by default. |
| 6 | Terms + place order | Required checkbox, then "إتمام الطلب." |

**Editing a previous step** re-opens it without discarding later progress, unless the change invalidates it (e.g. a new address invalidates the computed delivery fee, which must be recomputed and re-shown before payment).

**Duplicate-click protection:** the place-order button disables and shows a loading state immediately on click; combined with the idempotency key already required architecturally (blueprint §8/§9), this prevents a duplicate order both client- and server-side.

**Payment failure:** surfaces inline on the payment step (never a redirect to a dead page), with a retry action; all other checkout state is preserved.

**Mobile:** a sticky order-total bar is visible throughout checkout (principle: transparent pricing), single column, large tap targets on step headers.

---

## 11. Order Confirmation UX

Reassuring, not merely informational: a clear success indicator (checkmark, not just text), a prominent and copyable order number, an item/total summary, the payment status, and the delivery estimate. Primary CTA "تتبع طلبك"; secondary CTAs: "متابعة التسوق" and a WhatsApp/support link. For guest orders only, a light, dismissible account-creation prompt reusing the phone number already verified at checkout — never a hard wall.

---

## 12. Order Tracking UX

Public lookup: a two-field form (order number + phone) leading to the same result view used from the account. Timeline: vertical stepper — past stages checked, current stage emphasized, future stages muted — always in plain Arabic labels, never a raw ERP code (blueprint §8). Cancelled/refunded is shown as a distinct terminal state, not squeezed into the normal stepper. A contact/WhatsApp action is always visible on this specific page, since it is the highest-anxiety moment for an already-paying customer.

---

## 13. Account + OTP UX

Login: phone number → "إرسال الرمز" → OTP entry (4–6 digit boxes, auto-advance, auto-submit on completion, SMS-autofill paste support). Resend: disabled with a visible countdown, then re-enabled. Expired code: clear message, one-tap resend without re-entering the phone number. Wrong code: inline error; the phone number is not cleared; attempt count is not shown numerically to the customer (avoids an interrogation feel) but is rate-limited server-side; after too many attempts, a calm cool-down message with a support path — never a silent, permanent lockout. Logout: single tap, immediate, returns to Home. Account home: recent-order teaser plus quick links to Orders/Addresses/Profile/Favorites/Logout. Guest→account: the same phone number already verified at checkout is reused — no second OTP required to convert within the same session.

> **Preserved as open:** whether guest checkout requires OTP at all is not decided here (requirements §25). This section defines the OTP interaction pattern generically so it is ready the moment that decision lands, either way.

---

## 14. Offers UX

Offers index: card grid using the offer-shaped variant of the product card pattern (banner image, short copy, "عرض التفاصيل"). Landing pages reuse the Shop grid scoped to the offer (requirements OFF-002) — no bespoke template per campaign. Coupon field: single input + apply button inside the checkout review step; success shows the discount line appearing inline, failure shows a specific message per case (invalid/expired/limit-reached) — never a generic error. An offer that expires mid-session is re-validated at cart/checkout entry with a clear "انتهت صلاحية هذا العرض" notice, never a silent price change. The UI supports exactly one applied-coupon slot at a time, matching the proposed one-coupon rule (requirements §12) — if that business rule changes later, only the slot count changes, not the interaction pattern.

---

## 15. Recommendations UX

| Placement | Launch content | Priority |
|---|---|---|
| PDP | Horizontal row: "منتجات ذات صلة" (same-category) and, if curated, "أكمل المجموعة" | MUST / SHOULD |
| Cart | Small, dismissible cross-sell row above the CTA | NICE TO HAVE |
| Homepage | Best sellers only — **never labeled "لك خصيصًا" / "for you"**, since nothing is personalized yet | MUST |
| Order confirmation | Optional single-row teaser | NICE TO HAVE |

All launch recommendations are curated or rule-based (same category, merchandiser-flagged, or sales count) — copy must never claim personalization that doesn't exist. Statistical/behavioral recommendations remain deferred (requirements §13).

---

## 16. Products Experience UX

Each of the five chapters (Dates, Honey, Oils, Nuts, Ghee) follows the same template:

1. **Opening scene** — one striking image/short loop establishing the raw material (palm, flower/bee, raw press/seed, raw nut, raw milk/tradition); readable in under two seconds.
2. **Storytelling sequence** — 3–5 scroll-linked beats moving raw material → process → premium packaging reveal (mechanism per blueprint §17: GSAP/ScrollTrigger, Lottie, photography).
3. **Key message** — the single-line storytelling objective already fixed in requirements §14 (provenance, purity, quality, freshness, craft).
4. **Product interaction** — the sequence resolves into a curated showcase of 3–6 products, reusing the same Product Card component as the rest of the site (§6) for consistency.
5. **CTA** — "تسوق الآن" appears both at the showcase and as a small persistent pill during the scroll sequence itself, so a customer is never more than one tap from shopping regardless of scroll position.
6. **Transition to next chapter** — a clear chapter-end marker, a "الفصل التالي" control, and the persistent 5-chapter selector (requirements §14) for jumping directly.
7. **Exit** — after the fifth chapter, an explicit "العودة للتسوق" — never a dead scroll.
8. **Mobile adaptation** — fewer beats per chapter, transform-only animation, larger chapter-selector/CTA tap targets, the product showcase becomes a horizontal swipe row instead of a grid.
9. **Reduced motion** — each chapter renders as one static, content-complete section: hero image, key message as text, the same curated showcase, the same CTA.

Animations frame the products; they never obscure or delay reaching them — no chapter should require more than a few seconds of scrolling before its own shopping CTA is reachable.

---

## 17. Conversion UX

| Funnel stage | Customer concern | UX response | CTA | Trust signal | Friction removed |
|---|---|---|---|---|---|
| Discovery | "Is this relevant to me?" | Category tiles, clear hero | "تسوق الآن" / category tile | None yet — too early | No forced signup/interstitial |
| Interest | "Do I understand what this is?" | Category education, Products Experience | "شاهد القصة" | Sourcing/quality copy | Fully optional, skippable |
| Trust | "Is this a real, reliable company?" | About/Contact/trust strip/WhatsApp | "تواصل معنا" | Real contact info, policies | Policies one click away, never buried |
| Product evaluation | "Is this the right size/value?" | PDP variant chips, live price/availability | "أضف إلى السلة" | Honest stock state | No forced account to view details |
| Add to cart | "Did it work? What's next?" | Drawer confirmation, badge count | "إتمام الشراء" | Live pricing | No forced login to view cart |
| Checkout | "Total? How long? Is my data safe?" | Sticky total, delivery estimate | "إتمام الطلب" | Real session security, clear policy links | Guest checkout, single page, minimal fields |
| Purchase | "Did it actually go through?" | Confirmation + order number + tracking | "تتبع طلبك" | WhatsApp/support always visible | None — this is the reward moment |
| Repeat purchase | "Can I do this faster?" | Saved addresses, order history | "اطلب مرة أخرى" | Past successful order | No re-entering address/payment |

**CTA hierarchy:** exactly one primary (solid/filled) CTA per screen; secondary actions are text links or outline style, never competing in size or color. **Sticky CTAs** are reserved for exactly two moments — PDP add-to-cart and checkout total — overuse would dilute both. **Urgency:** only real, factual urgency (a genuine low-stock count from the catalog projection) — no fabricated countdowns or fake viewer counts. **Social proof:** none invented; best-sellers ranking is the only honest signal available at launch. **Reassurance:** factual only — real delivery estimate, real policy link, real contact info, never an invented guarantee.

---

## 18. Trust UX

| Location | Trust type | What appears |
|---|---|---|
| PDP | Product trust | Origin/quality line, packaging photography, WhatsApp question link |
| Checkout | Payment trust | Visible total before payment, real payment-method logos (once chosen), session security |
| Footer | Business trust | Real contact info, policy links, social links |
| About | Business trust | Sourcing story, brand narrative |
| Delivery step | Delivery trust | Real fee/estimate, serviceability check before payment |
| Order Confirmation | Reassurance | Order number, tracking link, support contact |

All content in this section must be business-supplied and factual — nothing here is invented, per requirements §15.

---

## 19. Mobile-first UX

- **Thumb reach:** primary actions (Add to Cart, Place Order, nav icons) sit within the reachable lower two-thirds of the screen; avoid critical actions in top corners.
- **Sticky CTAs:** PDP add-to-cart bar, checkout total bar — sized ≥44px tall.
- **Viewport height:** never rely on a fixed full-screen height for critical content (mobile address-bar collapse shifts it); avoid hero images tall enough to push a CTA below an unpredictable fold.
- **Keyboard:** focused inputs scroll into view above the keyboard; a nearby submit control is never covered.
- **Bottom sheets/drawers:** used for filters, cart, and menu instead of full-page navigation, preserving context.
- **Touch targets:** ≥44×44px everywhere, with enough spacing between adjacent controls (variant chips, quantity steppers) to prevent accidental taps.
- **Scroll:** avoid nested scroll containers (a scrollable drawer inside a scrollable page fights touch scrolling) — one active scroll container at a time.
- **Accidental taps:** destructive actions (remove from cart, delete address) get a brief undo affordance rather than instant, irreversible removal.
- **Network latency:** any server-bound action (add to cart, apply coupon, place order) shows an optimistic or loading state within ~100ms, so a tap never feels ignored on a slow connection.
- Per-area mobile/desktop differences are tabulated in requirements §19 — this section adds the physical-interaction rules behind that table.

---

## 20. Responsive UX

| Breakpoint | Structural behavior |
|---|---|
| Mobile (< 640px) | Single column throughout; drawers/overlays/bottom-sheets for cart, filters, menu; 2-column product grid; sticky CTAs active. |
| Tablet (640–1024px) | 3-column product grid; filters may become a persistent sidebar once width allows (~768px+). |
| Desktop (1024–1440px) | 4-column grid; persistent filter sidebar; full header nav (no hamburger); 2-column checkout (accordion + sticky summary sidebar); cart is a side panel, not full-screen. |
| Large desktop (> 1440px) | 4–5 column grid within a capped max content width (~1400–1600px) — extra width becomes whitespace, not more content density. |

---

## 21. Loading / empty / error UX

| Situation | Rule |
|---|---|
| Initial load (grids/cards) | Skeletons matching the final shape — never an unshaped spinner that causes layout jump. |
| Short button/action wait | A simple inline spinner is acceptable here only. |
| Slow network | Optimistic UI where safe (cart quantity, quick-add); explicit loading state otherwise, no layout jump. |
| Empty cart / empty search / no offers | An icon/illustration plus one clear next action — never blank white space. |
| Failed payment | Inline on the payment step, retry action, checkout state preserved. |
| Failed shipping calculation | Inline near the address step, retry action, address remains editable. |
| Expired session | Re-auth prompt that preserves in-progress cart/checkout state — never a full restart. |
| Invalid/expired OTP | Inline, specific message; no numeric attempt counter shown to the customer. |
| Generic server error | Arabic, non-technical, polite, includes an internal reference code and a WhatsApp/contact fallback — never a stack trace or raw HTTP status. |
| ERP sync delay (stale stock/status) | Shown as a calm "جاري التحديث" state, **not** an error — this is expected eventual consistency (blueprint §6/§9). |
| Order lookup failure | "لم يتم العثور على الطلب" (check the order number) is distinguished from "الخدمة غير متاحة مؤقتًا" (retry shortly) — different causes, different next actions. |

**Error copy rule:** clear, Arabic, actionable, non-technical, non-blaming — framed as "تأكد من …" guidance, never as fault-finding.

---

## 22. Accessibility UX

- **Keyboard:** logical, RTL-aware tab order; a "skip to content" link as the first stop; every interactive element reachable without a mouse.
- **Focus management:** opening a drawer/modal moves focus into it and traps it there; closing returns focus to the trigger; a route change moves focus to the new page's main heading.
- **Screen readers:** every icon-only control has an Arabic accessible label (e.g. the cart icon announces "السلة، N عناصر"); cart-count changes and form errors use `aria-live` regions.
- **Semantic hierarchy:** one H1 per page, logical heading order, landmark regions (header/nav/main/footer).
- **Form labels:** every input has a visible, associated Arabic label — placeholders are never the only label.
- **Validation:** errors linked to their field via `aria-describedby`, announced via `aria-live="polite"`.
- **Touch targets:** ≥44×44px, doubling as a motor-accessibility requirement, not just mobile comfort.
- **Color contrast:** WCAG AA minimum once brand colors exist — external dependency, not resolved here.
- **Reduced motion:** `prefers-reduced-motion` honored site-wide, not only inside Products Experience; any animation over ~500ms or auto-playing needs a no-motion equivalent.
- **RTL:** mirrored layout via logical CSS properties; only directionally-meaningful icons (back/forward arrows) mirror — brand marks like a WhatsApp icon never do.
- **Numerals/dates:** Western Arabic numerals (0–9) recommended for prices, quantities, phone numbers, and SKUs — matches common Egyptian commercial practice and avoids ambiguity (a UX recommendation, easily revisited at the design-system stage). Tracking/order dates shown in Gregorian format with Arabic month names.

---

## 23. Motion & micro-interaction principles

**Where motion is valuable:** state confirmation (added to cart, form submitted), orientation (a drawer/panel entering/exiting from its logical edge), storytelling (Products Experience only), subtle feedback (button press, toggle).

**Where motion is unnecessary — avoid:** decorative background movement, scroll-triggered text reveals on ordinary content (Shop grid, PDP fields), parallax on pages meant to feel fast (Shop/PDP/Checkout) — motion here fights the "fast path to purchase" principle directly.

**Transition principles** (durations/easing curves are a design-system decision, not fixed here):
- Route/page transitions: a simple fade/slide, never a signature animated transition that slows perceived navigation.
- Drawers/overlays: slide from their logical (reading-start) edge, with a fading backdrop.
- Buttons: a brief press/scale response only.
- Cart updates: the count badge gets a small pop; the affected line item gets a brief highlight — never the whole page.
- Loading: skeletons, not spinning logos.
- Success: a brief checkmark/confirmation motion (add-to-cart, order confirmation).
- Errors: appear calmly, without a shake/bounce (which reads as alarming or juvenile).
- Scroll storytelling: scoped entirely to the Products Experience route (blueprint §17), never bleeding into Shop/PDP/Checkout.

**Performance rules:** motion must never delay when an interactive element becomes usable; must never be required to perceive or access already-visible content; must never be introduced on Shop/PDP/Checkout in a way that risks Core Web Vitals — which is exactly why Products Experience is architecturally isolated (blueprint §16/§17) and allowed a richer motion budget there specifically.

**Reduced motion:** every pattern above has a reduced-motion equivalent that preserves the informational outcome (state changed, content revealed) while removing the perceptual movement.

---

## 24. UX analytics mapping

> A documentation gap was found while cross-checking this against the canonical docs: the original Stage 0 discovery output defined a full ecommerce event taxonomy, but the condensed `blueprint.md` §14 kept only the `track()` abstraction pattern, not the event list. The table below reconstructs the minimum mapping needed for frontend implementation, reusing the original canonical names wherever they exist. See [`ux-decisions.md`](./ux-decisions.md) §Consistency check for the full note.

| UX interaction | Event | Status |
|---|---|---|
| Any page loads | `page_view` | Canonical (Stage 0) |
| Category page viewed | `view_category` | Canonical |
| PDP viewed | `view_item` | Canonical |
| Product card clicked in a grid | `select_item` | Canonical |
| Add to cart (card or PDP) | `add_to_cart` | Canonical |
| Remove from cart | `remove_from_cart` | Canonical |
| Cart drawer/page opened | `view_cart` | Canonical |
| Checkout started | `begin_checkout` | Canonical |
| Delivery method/fee confirmed | `add_shipping_info` | Canonical |
| Payment method selected | `add_payment_info` | Canonical |
| Order placed successfully | `purchase` | Canonical |
| Refund issued | `refund` | Canonical |
| Homepage hero CTA clicked | `hero_cta_clicked` | Canonical |
| Offer clicked (banner/nav/badge) | `offer_clicked` | Canonical |
| WhatsApp contact action clicked | `whatsapp_clicked` | Canonical |
| Coupon applied successfully | `coupon_applied` | Canonical |
| Delivery method selected | `delivery_option_selected` | Canonical |
| Checkout abandoned | `checkout_abandoned` (fired with furthest step reached) | Canonical |
| Products Experience hub entered | `product_experience_started` | Canonical |
| A chapter scrolls into view | `product_experience_chapter_viewed` (param: category) | New — parameterized version of the original per-category events |
| "تسوق الآن" clicked inside a chapter | `product_experience_cta_clicked` (param: category) | New — needed to measure storytelling→shop conversion |
| Search performed | `search` | New — GA4-standard name, natural gap given §8 |
| Search result clicked | `select_item` with `list_name: search_results` | Reuses `select_item`, no new event |
| Order cancelled by customer (post-purchase, via /track) | `order_cancelled` | New — Phase 9.7, no existing event fit a post-purchase cancellation (`checkout_abandoned` is pre-purchase only) |
| OTP requested/verified/failed | *(not a product analytics event)* | Security-sensitive — belongs in server-side auth logs, deliberately excluded from client analytics |

This table stays intentionally minimal — it does not design the analytics architecture (that is blueprint §14's job); it only tells frontend implementation which interaction fires which event.

---

## 25. UX priority matrix

| UX area | MVP | Post-MVP | Reason |
|---|---|---|---|
| Home (hero, categories, best sellers, trust strip) | MUST | Offers/PE sections are conditional, not absent | Core orientation |
| Shop/Category grid, filter, sort | MUST | Fuzzy search, saved filters | Core discovery, requirements §3 |
| Product card + quick-add | MUST | Wishlist icon | Wishlist depends on Favorites (SHOULD) |
| PDP full spec + sticky Add to Cart | MUST | Buy Now, reviews, statistical FBT | Requirements §5/§22 |
| Search (normalized) | MUST | Typo tolerance | Requirements §3 |
| Cart drawer + page | MUST | Save for later | Requirements §6 |
| Checkout accordion | MUST | — | OTP-for-guest sub-step conditional on open decision |
| Order Confirmation | MUST | Account-prompt refinement | — |
| Order Tracking (public + account) | MUST | Real courier tracking | Requirements §9/§11 |
| Login/OTP mechanism | MUST | Account dashboard polish | Login itself is MUST; the dashboard is SHOULD |
| Coupon field | MUST | Offers index/landing pages, BOGO | Requirements §12 |
| Recommendations (best sellers only) | MUST-light | FBT, cross-sell rows, recently viewed | Requirements §13 |
| Products Experience | Post-MVP-ready | Full 5-chapter build | Architecturally independent, requirements §23 |
| Mobile bottom nav | Open decision | — | Not yet approved, requirements §25 |
| Accessibility (keyboard/screen reader/reduced motion) | MUST | Ongoing audits | Non-negotiable, requirements §18 |
| Motion/micro-interactions | MUST (functional feedback only) | Richer transitions | Products Experience motion is separately scoped |
| Analytics event wiring | MUST (cart/checkout/purchase) | Products Experience + search events | Core funnel matters most at launch |

---

## 26. Frontend implementation handoff

A future frontend implementation phase must receive from this document:

- **Page-level UX specs** (§4–§16): purpose, CTA hierarchy, and content per page — do not invent page structure beyond what's specified here and in requirements §2.
- **Reusable interaction patterns:** accordion (checkout steps, PDP collapsibles), drawer/bottom-sheet (cart, filters, mobile menu), stepper/timeline (order tracking), chip selector (variants), skeleton loading, optimistic-update-with-server-revalidation (cart quantity, quick-add), sticky CTA bars (PDP, checkout).
- **Responsive behavior:** the four-breakpoint structural table (§20) is binding — components are built against those structural changes, not just fluid scaling.
- **Component families implied:** Product Card, Category Tile, Price display (with compare-at), Availability badge, Variant chip, Quantity stepper, Cart line item, Checkout step, Order-status stepper, OTP input, Coupon field, Toast/inline banner, Skeleton (grid/card/text variants).
- **State requirements per family**, e.g.: Product Card → {loading, in-stock, low-stock, out-of-stock, on-sale}; Checkout step → {collapsed-incomplete, active, collapsed-complete}; OTP input → {idle, invalid, verifying, expired, rate-limited}. Build components around these named states, not ad hoc ones.
- **Animation principles** (§23): govern what may animate and what must always have a reduced-motion equivalent; Products Experience motion is separately scoped per blueprint §17.
- **Analytics interaction points** (§24): the minimum event set the frontend must fire, and from where.
- **Accessibility requirements** (§22): binding for every component, not optional polish.
- **Explicitly NOT specified here**, left to the Design System stage: exact colors, typography, spacing scale, iconography, motion durations/easing curves, exact breakpoint pixel values beyond the structural table, and component visual styling.
