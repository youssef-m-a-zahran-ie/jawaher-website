# Jawaher Al Khair — Digital Design System

Bridges the **official brand identity** (`_reference/brand/guidelines/Jawaher El khier.pdf`, 16 pages, "JAWAHER ELKHEIR Branding 2023," created by RUBIX) into a digital design system for the website, on top of the approved [`../ux/ux-specification.md`](../ux/ux-specification.md) and [`../architecture/technical-architecture.md`](../architecture/technical-architecture.md). No logo redesign, no new colors, no new typeface — this document only translates what already exists into digital rules, and clearly labels anything that goes beyond the source material.

Status: **Draft for review — Stage 0.95, extended in Phase 1.** Last updated: 2026-09-07.

> **Non-negotiable visual principle (added Phase 1, direct business input — status D, binding constraint, not a brand-guide extraction):** the website must never use cartoon visuals, cartoon characters, childish illustration, generic illustrated product scenes, or cheap-looking AI/CGI graphics. The visual direction is **premium, realistic, cinematic, professional** — every major visual experience should read like a real commercial campaign. Where CGI/3D/generated visual assets are ever used (most relevantly for Products Experience, §9), they must be photorealistic and production-quality: real-looking materials, lighting, shadows, liquids, food textures, and packaging, with cinematic camera movement and subtle, intentional animation — never gimmicky. This governs §7 (component visual language), §9 (Products Experience), and §10 (motion) below, and has direct technical consequences documented in `../architecture/technical-architecture.md` §16/§25 (asset size, lazy loading, mobile fallback, and performance-budget implications of photorealistic media).

**Status legend used throughout this file and its companions:**
- **A — OFFICIAL:** directly shown/specified in the brand guideline PDF.
- **B — DIGITAL ADAPTATION:** a reasonable digital translation of something official (e.g. applying an official color to a UI role the PDF doesn't itself show).
- **C — RECOMMENDATION:** new, not sourced from the brand guide at all, requires brand-owner approval before treating as settled.

---

## 0. Source material & method

Inspected: the full 16-page brand guideline PDF. **No other files exist yet** under `_reference/brand/` (logo, fonts, colors, references, guidelines subfolders are otherwise empty) or `_reference/products/` (no real product photography supplied yet — see `brand-to-ui.md` §2 for why this matters). Everything below is extracted directly from the PDF's pages; page references are cited so a reviewer can verify each claim against the source.

**Key brand facts extracted (not previously documented anywhere in this project):**
- Official Arabic wordmark: **جَـوَاهِـرُ الـخَـيـر** (Jawaher Elkheir), with a palm-tree icon above it.
- Official tagline: **"تُـمُوَرٌ وَ أكـثَـر"** ("Dates and More") — appears under the wordmark in every logo lockup (pages 2–7, 14).
- **The brand is dates-first.** Every real application shown in the deck (social posts, packaging, billboard) features dates specifically, and the tagline itself frames the other four categories (honey, oils, nuts, ghee) as the "and more" beyond the brand's anchor category. This has a direct consequence for `brand-to-ui.md` §3 (five category visual worlds).
- The deck was produced by an external agency (RUBIX) — page 16 is their own credit slide, not Jawaher content, and is excluded from everything below.
- **A currency discrepancy was found and is not resolved here:** the social-media mockups (p.10) and app mockup (p.11–12) show prices in "ريال سعودي" (Saudi Riyal). This project's technical documentation (`../architecture/technical-architecture.md` §13) assumes Egyptian Pound based on earlier business context. This is very likely just generic template pricing the agency reused, not a market statement — but it is flagged as an open question in `design-decisions.md` rather than silently resolved either way.

---

## 1. Brand foundations extracted

| Element | Finding | Source | Status |
|---|---|---|---|
| Recurring ghosted palm/diamond pattern | A large-scale, low-opacity repeating pattern of the palm icon and small diamond shapes, used as a background texture | pp.4, 10, 13 | A |
| Real palm-frond styling prop | Actual palm leaves used as a physical framing/foreground element in product photography | p.14 (billboard) | A |
| Product photography style | Warm, soft-lit studio photography; product presented simply (a woven basket, a small white bowl), minimal props beyond natural ones (palm frond, prayer beads) | pp.5, 13, 14 | A (style) — see `brand-to-ui.md` §2 for the real-vs-demo-asset distinction |
| Packaging visual language | Cream/gold patterned label background, a dark-brown pill/ribbon carrying the full logo lockup near the top, product name in bold dark brown, clean product photo lower on the label | p.13 | A |
| Stationery/merch application | Business cards in brown-with-gold-logo and white-with-brown/gold-logo; embroidered logo in white thread on olive fabric | pp.9, 15 | A |
| Primary CTA color evidence | The one real UI mockup in the deck (p.12, "أضف الي السله" / Add to cart) uses a solid dark-brown filled button with white text and moderately rounded corners | p.12 | A (evidence), formalized as a digital rule in §7 |
| RTL correctness of the app mockup | The mockup's back arrow ("«") and icon placement follow a generic, **not RTL-adapted**, e-commerce UI-kit convention | p.11–12 | Noted, **not treated as authoritative** — this project's own approved `../ux/ux-specification.md` §3/§22 already defines correct RTL navigation behavior and takes precedence over this generic template artifact |

---

## 2. Color tokens

The seven official colors, exactly as specified (HEX/RGB/CMYK, p.5):

| Name | Hex | Role in the brand guide itself |
|---|---|---|
| Primary Brown | `#402A1E` | Presented as the largest/first swatch — reads as the brand's primary color |
| Primary Gold | `#BFAB6F` | Logo color on dark backgrounds; one of the 4 official logo-background options |
| Light Gold / Cream | `#F2E3B3` | One of the 4 official logo-background options; used as a light section/label background (packaging, social posts) |
| White | `#FFFFFF` | One of the 4 official logo-background options; primary light surface throughout the deck |
| Black | `#000000` | One of the 4 official logo-background options; otherwise unused in real applications shown |
| Dark Gold / Brown | `#59441D` | Shown only as a palette swatch — no application shown |
| Gold / Brown | `#8C713F` | Shown only as a palette swatch — no application shown |

**Digital roles (B — digital adaptation, since the PDF doesn't itself assign UI roles):**

| Token | Value | Digital role | Accessibility note |
|---|---|---|---|
| `color.bg.primary` | `#FFFFFF` | Primary page background | — |
| `color.bg.secondary` | `#F2E3B3` | Secondary/section background (used exactly this way in real applications, p.6/10/13) | Text on this must use `text.primary`/`text.secondary`, never gold |
| `color.bg.dark` | `#402A1E` | Dark section background (footer, trust band, dark hero overlay) — the brand's own dark tone, not generic black | — |
| `color.bg.dark-alt` | `#000000` | Reserved, rare use only — official but unused in any real application shown; not the default dark surface | — |
| `color.text.primary` | `#402A1E` | Body/heading text on white or cream | 13.5:1 on white, 10.5:1 on cream — passes AAA |
| `color.text.secondary` | `#59441D` | De-emphasized text, captions, metadata on white/cream | 9.2:1 on white — passes AAA |
| `color.text.tertiary` | `#8C713F` | Lightest permissible text tone — labels, disabled-adjacent text, never body copy | ≈4.6:1 on white — passes AA only; avoid for small/caption text |
| `color.text.on-dark` | `#F2E3B3` (or `#FFFFFF`) | Text on `bg.dark` | Cream/white on `#402A1E` both pass AAA |
| `color.accent.gold` | `#BFAB6F` | Icons, borders, dividers, large display type (24px+ bold), the logo itself | **Fails accessibility as text color on white/cream (≈2.3:1)** — never use for body text, form labels, or small UI text on light backgrounds. Passes AA (≈6:1) as text/icon color on `bg.dark` (#402A1E) or black. |
| `color.cta.primary.bg` | `#402A1E` | Primary button fill | Backed by real evidence (p.12) |
| `color.cta.primary.text` | `#FFFFFF` | Primary button label | 13.5:1 — passes AAA |
| `color.cta.secondary` | Outline, `#402A1E` border + text on transparent/white | Secondary button | Same contrast as primary text |
| `color.border` | `#8C713F` at reduced opacity, or `#F2E3B3` | Card/input borders | Decorative use only, not relied on for information |
| `color.surface.card` | `#FFFFFF` (on cream backgrounds) or `#F2E3B3` (on white backgrounds) | Card surface — always alternates with its parent background so a card never disappears into its container | — |

**C — recommendation, pending brand-owner approval:** semantic colors for success/warning/error states are not part of the brand palette at all (the guide has no such colors). A digital-only addition (e.g. a muted green/amber/red used sparingly, never for primary UI chrome) is proposed and must be approved separately — it is deliberately excluded from the "brand" palette above so it's never confused with an official brand color.

---

## 3. Typography

Official typeface: **Almarai**, in four weights — **Light, Regular, Bold, Extra Bold** (p.5). Almarai is a real, freely available Arabic+Latin typeface (Google Fonts), self-hostable, with no technical obstacle to using it exactly as specified — **it is not replaced.**

| Role | Weight | Size guidance (relative scale — exact px is a later refinement) | Notes |
|---|---|---|---|
| Display / Hero headline | Extra Bold | Largest step | Homepage hero, Products Experience chapter titles |
| H1 | Extra Bold | Large | Page titles (Category name, PDP product name context) |
| H2 | Bold | Large-medium | Section titles (Home sections, PDP section headers) |
| H3 | Bold | Medium | Subsection titles, card group headers |
| H4 | Bold | Medium-small | Component-level headers (accordion titles, modal titles) |
| Body large | Regular | Medium-small | Intro/lede paragraphs, category descriptions |
| Body | Regular | Base | Default running text |
| Body small | Regular | Small | Secondary descriptions, help text |
| Caption | Regular | Smallest | Timestamps, meta text, form hints |
| Buttons | Bold | Matches body/body-small | Never Light — buttons need clear weight for a solid-fill CTA (matches p.12 evidence) |
| Prices | Extra Bold | Larger than surrounding body text | Matches the bold, oversized price treatment seen in the app mockup (p.11–12) |
| Product names (card/PDP) | Bold | Body-large to H4 range depending on context | — |
| Navigation | Regular or Bold (active state) | Body-small to body | Active/current nav item may step up to Bold for hierarchy, not a color change alone |
| Labels/eyebrows | Bold, letter-spaced | Caption-to-body-small | Mirrors the "TITLE" label style shown in the type-hierarchy example (p.5) |

**Light weight usage (C — recommendation):** the brand guide shows Light only in its own specimen line, not in any real application. Recommend restricting Light to large-scale decorative/display contexts only (24px+), never small body or caption text — small Arabic text in a Light weight loses legibility, especially for diacritic-bearing or dense words. This is a digital-legibility recommendation, not a brand rule, and should be confirmed with whoever owns the brand guideline if a specific Light-weight application was intended.

**Arabic text hierarchy:** generous line-height (Arabic script needs more vertical breathing room than Latin at the same point size), never justified text (ragged edge only), comfortable measure (see `_layout system_` §6), and no all-caps transformation (Arabic has no case distinction — hierarchy is carried by weight/size/color, never by casing).

**Responsive typography:** the scale above steps down by roughly one size-step at the mobile breakpoint for Display/H1/H2 specifically (hero and page titles are the most likely to be oversized on small screens); Body/Body-small/Caption stay constant across breakpoints so reading comfort doesn't shrink on mobile, where most traffic occurs.

---

## 4. Logo system

Three official variants (p.8, explicitly labeled): **Horizontal (main)**, **Vertical**, **Icon-based** (a diamond outline containing the palm icon alone). An official construction grid with clear-space guides exists (p.8) — the diamond/palm icon sits centered above the wordmark with a defined proportional relationship; the wordmark's clear space is bounded by the dotted grid shown, and no element should be redrawn or placed closer than that grid implies.

Four confirmed logo/background combinations (p.6, restated with source): on `#402A1E` (gold+cream logo), on white (dark-brown+gold logo), on `#BFAB6F` (darker-toned logo for legibility), on black (gold+cream logo) — plus a monochrome/grayscale variant (p.7) for single-color or reduced-color contexts.

| Placement | Recommended variant | Status |
|---|---|---|
| Desktop header | Horizontal (main) | B |
| Mobile header | Horizontal (main), scaled down — **not** a separate compact lockup, since none is defined in the official variant set | B |
| Footer | Horizontal (main) or Vertical, depending on footer column width | B |
| Favicon | Icon-based | B — the diamond+palm mark is the obvious, already-designed candidate for a small/square favicon; no redrawing needed |
| Social/share image | Horizontal (main) on white or `#402A1E`, matching p.6's confirmed combinations | B |
| Loading/splash (if the app ever needs one) | Vertical or Icon-based | C — not shown in any real application; a recommendation only if a splash moment is later designed |
| Dark backgrounds (site-wide dark sections) | Gold+cream lockup, per p.3/p.6 | A |
| Light backgrounds | Dark-brown+gold lockup, per p.2/p.6 | A |

No logo redraw, recolor, or new variant is introduced anywhere in this document.

---

## 5. Design tokens

| Category | Specification | Status |
|---|---|---|
| Color | §2 above | A/B mixed, per token |
| Typography | §3 above | A (typeface/weights), B (scale mapping) |
| Spacing | A single spacing scale (e.g. a base-8 or base-4 progression) — not specified by the brand guide at all | C |
| Radius | Moderately rounded corners (matches the soft-cornered card/button style in the app mockup, p.12) — not a sharp/square system, not an exaggerated pill/bubbly system either | B |
| Shadows | Soft, low-opacity, warm-tinted (a neutral-grey shadow reads as generic/cold against a warm brown-gold palette — a shadow with a slight brown tint feels intentional) | C |
| Borders | Hairline, using `color.border` (§2) — reserved for separating cards/inputs, never for decoration alone | B |
| Containers | Page max-width capped (per `../ux/ux-specification.md` §20's large-desktop rule) | Confirmed from existing UX spec, not new here |
| Grid | Standard responsive column grid matching the breakpoints already fixed in `../ux/ux-specification.md` §20 | Confirmed from existing UX spec |
| Breakpoints | Unchanged from `../ux/ux-specification.md` §20 (mobile / tablet / desktop / large desktop) | Confirmed, not redefined here |
| Motion | See §10 below | C |
| Z-index layers | A small ordered scale (base content → sticky headers/CTAs → drawers/overlays → modals → toasts) matching the interaction patterns already fixed in `../ux/ux-specification.md` §3/§9/§10 | B |

No exotic or over-engineered token categories are introduced — this list matches exactly what the brief asked for and nothing more.

---

## 6. Layout system

Not specified by the brand guide (a print/social deck has no web grid) — **entirely a digital recommendation (C)**, designed to feel premium and spacious without becoming wasteful, and to fit the RTL/Arabic requirements already fixed in the UX spec.

| Concern | Recommendation |
|---|---|
| Page max width | Capped (matches `../ux/ux-specification.md` §20's large-desktop rule — extra width becomes whitespace, not more columns) |
| Content width | Narrower than the page max width for reading-heavy content (About, Policies, FAQ) — generous margins read as premium, not empty |
| Gutters | Consistent across the product/category grids, scaling down (not just proportionally shrinking) on mobile so touch targets stay comfortable |
| Section spacing | Generous vertical rhythm between homepage sections (§8) — a cramped homepage would undercut the "premium" brand tone entirely |
| Product grid | 2/3/4–5 columns by breakpoint, unchanged from `../ux/ux-specification.md` §5/§20 |
| Card grid | Same gutter/margin logic as the product grid, applied to any other card collection (offers, categories) |
| RTL alignment | Text right-aligned by default (logical, not hard-coded "text-align: right" — matches the logical-property requirement already fixed in the UX spec) |
| Text measure | Comfortable Arabic reading width for body copy (About, Policies, product descriptions) — not full-bleed edge-to-edge text |

---

## 7. Component visual language

For every component: purpose, visual hierarchy, typography, color usage, spacing, states, responsive behavior, and accessibility — at the visual-direction level only, no implementation.

| Component | Visual direction |
|---|---|
| **Header** | White or cream background by default; logo (Horizontal, §4) at the reading-start side; utility icons quiet/outline style until hovered/focused; sticky per `../ux/ux-specification.md` §3. |
| **Navigation** | Body-weight labels, Bold for the active item (not a color change alone — supports colorblind users); category dropdown uses card-style surface with a hairline border. |
| **Search** | Overlay/panel on `bg.primary`, input with a visible focus ring in `accent.gold` at sufficient width to remain visible (a thin gold ring reads brand-appropriate without relying on gold for text). |
| **Buttons (primary)** | Solid `#402A1E` fill, white Bold text, moderate radius (§5) — directly evidenced by p.12. |
| **Buttons (secondary)** | Outline in `#402A1E` or `#8C713F`, matching text color, transparent/white fill — used for "متابعة التسوق," "تعديل," etc. |
| **Inputs** | White/cream fill, hairline border (`color.border`), primary-brown text, gold focus ring — error state uses a distinct (non-gold, non-brand) semantic color per §2's flagged addition. |
| **Product Cards** | White or cream surface (alternating with the grid's own background, §2), product photo dominant, name in Bold, price in Extra Bold, availability/sale badges as small solid-fill pills using brand tones, not the semantic-error palette. |
| **Product Detail** | Photography-led — the product image occupies the visual majority above the fold on mobile (`../ux/ux-specification.md` §7); brand color used for price, CTA, and accents only, never competing with the product photo. |
| **Price display** | Extra Bold current price, smaller struck-through compare-at price above or beside it — directly evidenced by p.11–12's "160 → 124" treatment. |
| **Badges** | Small solid-fill pills — brand tones (`accent.gold` on dark, `bg.dark` on cream) for merchandising badges (best seller, new); the flagged semantic palette (§2) only for availability/error state badges. |
| **Filters** | Bottom-sheet (mobile) or sidebar (desktop) per `../ux/ux-specification.md` §5; chip-style selected/unselected states using brand tones, never gold-on-white text. |
| **Drawers** (cart, filters, menu) | White/cream surface, sliding from the reading-start edge (`../ux/ux-specification.md` §3), a subtle brand-pattern accent (§1's ghosted palm motif) permissible at very low opacity on the drawer's empty-state illustration only — never across functional content. |
| **Modals** | Centered, white surface, dark-brown heading, backdrop in a translucent dark-brown (not generic black) tint — ties the overlay color back to the brand rather than a generic grey scrim. |
| **Accordion** (checkout steps, PDP collapsibles) | Bold section header, hairline divider, gold accent only on the active/expanded indicator icon. |
| **Cart** | Matches Product Card visual language for line items; sticky total bar (`../ux/ux-specification.md` §10) in `bg.dark` with `text.on-dark` for maximum "this is the total, pay attention" contrast. |
| **Checkout** | Calm, quiet chrome (white/cream, minimal decoration) so the brand doesn't compete with the task of completing a purchase — the accordion pattern itself carries the hierarchy, not heavy branding. |
| **Alerts / Toasts** | Solid-fill, brief, using the flagged semantic palette (§2) for success/error; brand tones reserved for neutral/informational toasts (e.g. "أُضيف إلى السلة"). |
| **Skeletons** | Neutral cream/light-grey shimmer — never gold (a shimmering gold skeleton would read as a loading gimmick, undercutting "premium/restrained"). |
| **Empty states** | An illustration or icon using brand tones at reduced saturation/opacity, paired with a clear next action (`../ux/ux-specification.md` §21) — the ghosted palm pattern (§1) is a natural fit here specifically. |
| **Error states** | Calm appearance (no shake/bounce, per `../ux/ux-specification.md` §23), semantic color (§2) for the icon/accent only, body text stays `text.primary`. |
| **Footer** | `bg.dark` (`#402A1E`) with `text.on-dark`, Horizontal or Vertical logo, comprehensive links per the approved IA — this is the one place a fully dark, brand-forward section is expected sitewide. |

---

## 8. Homepage visual system

Translates the already-approved homepage UX (`../ux/ux-specification.md` §4) into visual structure — **not a UX redesign.**

| Section | Visual treatment |
|---|---|
| Hero | Full-width photography (real product, once supplied — see `brand-to-ui.md` §2), a palm-frond styling element permitted as a foreground/framing detail (matches p.14's real application), headline in Display/Extra Bold, one primary CTA button (§7). |
| Categories (5 tiles) | Card grid, product/category photography-led, tile labels in H4/Bold, no heavy iconography needed — the photography carries the brand. |
| Best sellers | Standard Product Card grid (§7). |
| Trust/credibility strip | Quiet, cream or white background, small icon + short Bold label per trust point — restrained, not a loud banner. |
| Offers | Card treatment matching Product Cards, with a badge (§7) indicating the discount — rendered only when active, per the approved UX rule. |
| Story & Products Experience teaser | A single merged section (per approved UX), photography-led, allowed the ghosted-palm-pattern treatment (§1) as a background accent behind the headline text specifically, since this is the one homepage section where brand storytelling — not transaction — is the point. |
| Footer | §7 above. |

---

## 9. Products Experience visual direction

The five chapters (`../ux/ux-specification.md` §16) get the brand's **most expressive** treatment, while still reading as unmistakably Jawaher Al Khair — and while strictly honoring the non-negotiable visual principle at the top of this document. Concretely: no cartoon bees, no illustrated palm trees, no stylized/flattened CGI food. Every raw-material, process, and packaging beat (§9's own opening-scene/sequence/product-interaction structure) must use real photography/video, or CGI indistinguishable from it — cinematic lighting and camera movement, not a motion-graphics explainer style.

| Concern | Direction |
|---|---|
| Background strategy | `bg.dark` (`#402A1E`) or `bg.dark-alt` (black, reserved/rare, §2) as the base for immersive scenes, letting real product/process photography and the gold accent carry visual interest against it — matches the brand's own dark-background logo treatment (p.3/p.6/p.7) rather than inventing a new dark palette. |
| Typography treatment | Display/Extra Bold for each chapter's key message (`../requirements/website-functional-requirements.md` §14's storytelling objectives), set in `text.on-dark` — large, confident, unhurried. |
| CTA treatment | The same primary button visual language as the rest of the site (§7) — the Products Experience must never invent a second button style; consistency here is what keeps it feeling like the same brand, not a microsite. |
| Product presentation | Real product/packaging photography only (see `brand-to-ui.md` §2) at the resolution moment of each chapter — never a generic 3D render or stock substitute standing in for the actual product. |
| Transition language | Simple fades/reveals between scroll beats (per the animation principles already fixed in `../ux/ux-specification.md` §23) — no per-chapter signature transition gimmick that would compete with the product. |
| Motion principles | See §10 below — restrained, premium, never bouncy. |
| Mobile adaptation | Fewer beats, transform-only motion, larger tap targets — unchanged from `../ux/ux-specification.md` §16; visually, this means simpler compositions (one focal element per screen) rather than the desktop version's potential layering. |
| Reduced-motion adaptation | Each chapter's static fallback (`../ux/ux-specification.md` §16) uses the exact same color/typography rules above — reduced motion must never look like a "lesser," off-brand version of the page. |

No GSAP/WebGL/implementation decisions are made here — this section is visual direction only, consistent with `../architecture/blueprint.md` §17's already-approved technical approach.

---

## 10. Motion design system

**Not specified anywhere in the brand guide** (a static print/social deck has no motion content) — this entire section is **C — recommendation**, grounded in the brand's established tone (premium, warm, crafted, unhurried) rather than in any source material, and should be confirmed by whoever owns the brand identity before being treated as settled.

| Principle | Direction |
|---|---|
| Hover | Subtle lift/shadow (warm-tinted, §5) or a gentle brightness/scale shift — never a color-inverting or bouncy hover. |
| Press | A brief, small scale-down — confirms the tap without feeling springy. |
| Reveal | Content fades/rises in gently — never slides in from an aggressive distance or overshoots. |
| Fade | The default transition for most state changes (§ux-specification.md §23). |
| Slide | Reserved for drawers/overlays entering from their logical edge — not used for ordinary content reveals. |
| Image transitions | Crossfade, not a hard cut or a flashy wipe. |
| Cart interactions | A small, warm "pop" on the count badge and a brief highlight on the added line — matches `../ux/ux-specification.md` §23 exactly, restated here with the brand-tone justification. |
| Page transitions | Simple fade/slide — fast, since this is a shopping site first (per the "fast path to purchase" UX principle). |
| Scroll storytelling | Scoped entirely to Products Experience (§9) — smooth, deliberate, unhurried scrubbing, never jumpy. |

**Explicitly avoided, per the brand's premium/restrained tone:** excessive bouncing, elastic/spring overshoot, childish easing curves, gimmicky particle/confetti effects, animation applied indiscriminately "everywhere," and any transition slow enough to feel like it's making the customer wait to shop.

---

## 11. Responsive design

| Breakpoint | Brand-specific behavior |
|---|---|
| Mobile | Logo scales down but stays the Horizontal (main) lockup, never cropped to icon-only outside the favicon context (§4); product photography takes visual priority over decorative brand elements (ghosted pattern, palm-frond props) — those recede or disappear entirely on small screens where space is scarce. |
| Tablet | Brand decorative elements (pattern, palm-frond styling) may reappear at reduced scale in hero/section contexts where space allows. |
| Desktop | Full expressive range — pattern accents, larger photography, more generous spacing (§6). |
| Large desktop | Extra width becomes whitespace/breathing room (§6), not larger decorative elements — restraint scales with space, not the reverse. |

RTL, logo scaling, navigation, grids, typography, CTA sizing, spacing, image ratios, checkout, and Products Experience responsive *structure* are unchanged from `../ux/ux-specification.md` §19/§20/§21 — this section only adds the brand-visual layer on top of that already-approved structural behavior. Mobile is never "a compressed desktop" here either: decorative brand elements are removed first, not shrunk, when space is constrained.

---

## 12. Accessibility

- **Contrast:** governed entirely by §2's token table — every text/background pairing recommended there already passes at least WCAG AA; the one identified failure (`accent.gold` on light backgrounds) is documented as a restriction, not used anywhere text-critical.
- **Focus states:** a visible `accent.gold` focus ring at sufficient width/contrast against its surface — brand-colored, but never relying on gold alone where a thin ring might fail contrast on cream; pair with a subtle outline in `text.primary` if needed.
- **Keyboard states:** unchanged from `../ux/ux-specification.md` §22 — this document adds color/visual treatment only.
- **Readable typography:** §3's restriction on Light weight at small sizes is itself an accessibility-motivated call.
- **Touch targets:** ≥44×44px, unchanged from the UX spec — brand styling (radius, fill) never shrinks a target below this.
- **Reduced motion:** §9/§10 — every brand-forward motion pattern has a static equivalent that preserves the same color/typography treatment, never a "downgraded" look.
- **Form states:** error/success indication uses the flagged semantic palette (§2), never color alone (paired with icon/text per `../ux/ux-specification.md` §22).
- **Error states:** calm, brand-toned chrome around a clearly non-brand-colored (semantic) error indicator, so the error itself is never mistaken for a decorative gold/brown accent.
