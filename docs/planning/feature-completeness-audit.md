# Feature Completeness Audit — Phase 1

Purpose: catch what the previous ERP project didn't — architectural decisions or missing features discovered only after implementation had progressed. This audit classifies every common production e-commerce capability against the current planning documents, so gaps are found now, in writing, rather than during real usage.

Classification legend: **MVP** (required for launch) · **Production-required** (needed before real traffic, may land just after MVP) · **Later** (deliberately post-launch) · **Out of scope** (not part of this project) · **Open decision** (business/legal input needed) · **Already covered** (an existing doc already addresses it — cited).

Status: Stage: Phase 1. Last updated: 2026-09-07.

---

## New findings from this audit (not previously documented)

These are genuine gaps surfaced while performing this audit — not restatements of already-tracked open questions. Each is real enough to act on before it's discovered "during real usage."

| # | Finding | Classification | Detail |
|---|---|---|---|
| 1 | **Inventory hold during the payment window** | Production-required, Open decision | `docs/architecture/technical-architecture.md` §9/§16 checks inventory at order-creation, which for online payment happens *after* payment capture (§9's COD-vs-online split). If stock sells out between "customer clicks pay" and "order-creation transaction runs," the customer is charged with no order created. Recommend a short-lived (e.g. 10–15 minute) soft inventory hold created at payment-initiation and released on failure/timeout/expiry — or, at minimum, an automatic-refund trigger wired to this specific failure path before Commerce phase implementation begins. This is a correctness gap, not a business decision, but the hold duration/UX (e.g. "your items are reserved for 15 minutes") needs product input. |
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
