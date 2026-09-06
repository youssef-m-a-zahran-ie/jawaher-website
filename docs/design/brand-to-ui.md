# Jawaher Al Khair — Brand-to-UI Bridge

Extracts the design language behind the brand guide's real applications, defines how real product imagery should be presented, defines how the shared brand system adapts across the five categories, and maps every brand element to its website application. Companion to [`design-system.md`](./design-system.md).

Status: **Draft for review — Stage 0.95.** Last updated: 2026-09-06.

---

## 1. Design language extracted from real brand applications

Inspected: business cards (p.9), social media templates (p.10), a mobile app mockup (p.11–12), packaging (p.13), a billboard (p.14), and embroidered merchandise (p.15) — the recurring pattern is described here, not the individual mockups themselves.

| Application | What it shows | The underlying design language (not the literal mockup) |
|---|---|---|
| Business cards | Brown card + gold logo; white card + brown/gold logo | Two-surface system: a dark brand-forward surface and a light neutral surface, never a busy in-between |
| Social templates | Cream or dark photo background; bold white/dark headline over a darkened photo band; small logo lockup top-left; price shown as a struck-through old price + a bold new price, each in a small rounded badge | Photography-first composition with type kept minimal and confined to clear bands, not scattered; price treated as a confident, oversized focal element, not fine print |
| App mockup | White surface, rounded product card, Extra-Bold price treatment, solid dark-brown CTA button | The brand's UI instinct (even from a generic template) is restrained: mostly white space, one strong color moment (the CTA), photography doing the selling |
| Packaging | Patterned cream label, dark-brown logo ribbon, bold product name, simple centered product photo | A label is a miniature version of the same hierarchy: pattern as texture (not focus), logo as a seal of trust, name as the clear headline, photo as the payoff |
| Billboard | Large macro product photography, real palm-frond prop, white space, logo confined to one corner | At its largest scale, the brand trusts photography completely and uses the logo sparingly — restraint scales *up*, not just down |
| Embroidered merch | Single-color logo, legible even in thread texture | The logo's construction (§ design-system.md §4) survives severe reduction to one color — a useful signal that it will also survive small digital contexts (favicon, compact header) |

**The one sentence this all reduces to:** *photography leads, the palette supports, and the logo/color are used with restraint even at the brand's most expressive (billboard) and most reduced (embroidery) extremes.* This sentence, not any single mockup, is what the website's visual direction should match.

---

## 2. Product presentation

**Critical distinction, not yet resolved by supplied assets:** `_reference/products/images/` (dates, honey, oils, nuts, ghee), `_reference/products/packaging/`, and `_reference/products/catalog/` are **currently empty** — no real product photography has been supplied to this project yet. The photography shown throughout the brand guide (baskets of dates, a bowl of dates, dates on a billboard) was produced by the branding agency (RUBIX) to *demonstrate* the brand system and is **not confirmed to be usable, owned, or final product photography** for the live website. It is evidence of *style direction* (§1), not a source of usable final assets.

| Asset type | Definition | Source | Status |
|---|---|---|---|
| **Real product assets** | Actual photography of Jawaher Al Khair's real dates/honey/oils/nuts/ghee products and packaging, supplied by the business | `_reference/products/images/`, `_reference/products/packaging/` — **not yet supplied** | Required before PDP/Shop/category launch |
| **Creative storytelling assets** | Any generated, stock, or illustrative imagery used for mood/atmosphere (e.g. a raw-material establishing shot for a Products Experience chapter, if the real thing can't be photographed) | `_reference/experience/<category>/` | Must be clearly distinguished from real product photography wherever both appear on the same page — a customer should never mistake a mood shot for a photo of the actual product they're buying |
| **Brand-demo assets** | The dates photography inside the brand guideline PDF itself | The PDF, pp.5, 10–14 | Reference for *style* only (§1) — not to be extracted/reused as final website assets without explicit confirmation it's licensed/owned for that use |

**Presentation rules (digital adaptation of §1's style finding):**
- **White-background product images** (PDP gallery primary, product cards): clean, evenly lit, true-to-color packaging — matches the app-mockup and packaging-label photography style.
- **Packaging imagery**: shown as its own gallery image on the PDP, not only implied by a lifestyle shot — customers buying a premium gift item want to see exactly what arrives.
- **Lifestyle/context imagery** (a bowl, a basket, a natural prop like a palm frond): permitted on category pages, homepage, and Products Experience — matches pp.5/13/14 — but the PDP's *primary* image should be the clean product shot first, with lifestyle images as secondary gallery entries.
- **Close-ups**: appropriate for texture/quality storytelling (a macro shot of a single date, honey being poured) — matches the billboard's macro treatment (p.14) and fits the Products Experience chapters (`design-system.md` §9) especially well.
- **Category imagery**: one representative hero image per category tile (Home, Category page) — photography-led, minimal text overlay, matching §1's "photography leads" principle.

**Never:** distorting or artificially altering real product packaging photography (e.g. recoloring a package to match a page's color scheme), and never presenting a generated/stock image as if it were the real product.

---

## 3. Five category visual worlds

The brand is **dates-first** (`design-system.md` §0/§1) — the tagline itself ("تمور و أكثر") frames dates as the anchor and the other four categories as "and more." This has a direct, practical consequence: **the shared brand system was built and evidenced entirely around dates; nothing in the guide shows honey, oils, nuts, or ghee.** The five category worlds below are therefore mostly a same-system extension with **no dates-specific asset dependency** for the other four — everything about color, typography, logo, and component visual language (`design-system.md` §2–§7) applies identically across all five. Only imagery and storytelling content differ, exactly as scoped by `../requirements/website-functional-requirements.md` §14's five storytelling objectives.

| Category | Shared system (unchanged) | Category-specific difference | Status |
|---|---|---|---|
| Dates (تمور) | Full palette, typography, logo, components | Directly evidenced imagery style (§1) — the brand's home turf; category photography can lean on the same warm, basket/bowl studio style already shown | A (imagery style), B (everything else, applied consistently) |
| Honey (عسل) | Same | Imagery/storytelling only — golden tones in real honey photography will naturally harmonize with `accent.gold`, a fortunate but not engineered coincidence worth noting | C — no source evidence, digital recommendation only |
| Oils (زيوت) | Same | Imagery/storytelling only — glass bottle photography, similar clean-studio treatment | C |
| Nuts (مكسرات) | Same | Imagery/storytelling only | C |
| Ghee (سمن) | Same | Imagery/storytelling only — traditional jar/container photography | C |

**What must NOT happen:** five unrelated visual identities, a different color accent per category, a different typeface or logo treatment per category, or a different component style per category. The only permitted per-category variation is **which photography and which story copy appears where** — everything structural stays one Jawaher Al Khair system, per the task's explicit instruction.

---

## 4. Brand → UI mapping

| Brand element | Official source | Website application | Status |
|---|---|---|---|
| Logo — Horizontal (main) | PDF p.8 | Desktop/mobile header, footer, social share image | OFFICIAL |
| Logo — Vertical | PDF p.8 | Footer (narrow column), possible splash/loading context | OFFICIAL |
| Logo — Icon-based | PDF p.8 | Favicon | OFFICIAL (favicon application is a DIGITAL ADAPTATION of an official asset) |
| Logo — monochrome variant | PDF p.7 | Reduced-color contexts (e.g. a print invoice, a single-color email header) if ever needed | OFFICIAL |
| Logo clear-space/grid | PDF p.8 | Enforced minimum spacing around the logo wherever it appears | OFFICIAL |
| Color — Primary Brown `#402A1E` | PDF p.5 | Primary text, dark sections, primary CTA fill | OFFICIAL color, DIGITAL ADAPTATION of role |
| Color — Primary Gold `#BFAB6F` | PDF p.5 | Accents, icons, borders, large display type, text-on-dark | OFFICIAL color, DIGITAL ADAPTATION of role |
| Color — Cream `#F2E3B3` | PDF p.5 | Secondary background/surface | OFFICIAL color, DIGITAL ADAPTATION of role |
| Color — White / Black | PDF p.5 | Primary surface / rare-use dark alt | OFFICIAL color, DIGITAL ADAPTATION of role |
| Color — `#59441D` / `#8C713F` | PDF p.5 | Secondary/tertiary text tones | OFFICIAL color, DIGITAL ADAPTATION of role (no application shown in source) |
| Typography — Almarai, 4 weights | PDF p.5 | Full site type scale (`design-system.md` §3) | OFFICIAL typeface, DIGITAL ADAPTATION of scale |
| Ghosted palm/diamond pattern | PDF pp.4, 10, 13 | Low-opacity background accent (empty states, homepage story section, packaging-style callouts) | OFFICIAL motif, DIGITAL ADAPTATION of placement |
| Real palm-frond styling prop | PDF p.14 | Hero/lifestyle photography direction | OFFICIAL reference, DIGITAL ADAPTATION (depends on real photography being commissioned) |
| Packaging visual language | PDF p.13 | Informs product/packaging photography presentation (§2) — the website does not reproduce packaging design itself | OFFICIAL reference |
| Photography style (warm, simple, studio) | PDF pp.5, 13, 14 | Product/category photography direction | OFFICIAL reference, pending real assets (§2) |
| Social media template layout | PDF p.10 | Not directly reused (a social template isn't a website layout) — informs "photography-first, minimal type" principle only | OFFICIAL reference, informs a RECOMMENDATION |
| App mockup (CTA style, price treatment) | PDF pp.11–12 | Primary button and price-display visual language (`design-system.md` §7) | OFFICIAL evidence, **except** RTL interaction direction (not authoritative — see `design-system.md` §1) |
| Iconography (beyond the logo) | Not specified | A general-purpose icon set for cart/search/account/etc. | OPEN — no brand icon language exists; needs either a brand-owner recommendation or a neutral, restrained icon set chosen at implementation time |
| Motion/animation language | Not specified | `design-system.md` §9/§10 | RECOMMENDATION — entirely digital, not sourced |
| Semantic (success/error) colors | Not specified | `design-system.md` §2 | RECOMMENDATION — explicitly kept separate from the brand palette |
| Website/mobile-app reference | PDF pp.11–12 | Visual style only (§1); RTL/interaction behavior is NOT sourced from here | OFFICIAL evidence, PARTIAL (style yes, interaction no) |
