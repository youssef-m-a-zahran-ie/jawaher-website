# Jawaher Al Khair — Design Decision Log & Consistency Check

Records what must be preserved unchanged from the brand guide, what this stage adapted or recommends, what still needs the brand owner's sign-off, and what's deliberately deferred — plus the results of cross-checking [`design-system.md`](./design-system.md) and [`brand-to-ui.md`](./brand-to-ui.md) against every prior canonical document. Mirrors the pattern established in [`../ux/ux-decisions.md`](../ux/ux-decisions.md) and [`../architecture/technical-decisions.md`](../architecture/technical-decisions.md).

Status: **Stage 0.95, + Phase 2 additions/consistency check appended.** Last updated: 2026-09-07.

---

## A. Brand rules we MUST preserve

Non-negotiable — directly from the brand guideline PDF, never altered by this or any later stage without the brand owner's explicit change:

- The logo (all three variants: Horizontal/main, Vertical, Icon-based) is used exactly as designed — no redrawing, recoloring, re-proportioning, or new variant invented.
- The seven official colors (`#402A1E`, `#BFAB6F`, `#F2E3B3`, `#FFFFFF`, `#000000`, `#59441D`, `#8C713F`) are the complete brand palette — no additional brand color is introduced.
- Almarai, in exactly the four specified weights (Light, Regular, Bold, Extra Bold), is the only typeface — no substitution.
- The official tagline "تُـمُوَرٌ وَ أكـثَـر" and the wordmark "جَـوَاهِـرُ الـخَـيـر" are reproduced exactly, never re-worded or re-set in a different typeface.
- The four confirmed logo/background color combinations (dark brown, white, gold, black) are the only backgrounds the logo is placed on without a documented, approved exception.
- The logo's construction grid and clear-space (p.8) are respected wherever the logo appears, digital or print.

## B. Digital adaptations approved/recommended by this stage

Reasonable translations of official material into digital roles — documented with their reasoning in `design-system.md`, treated as settled unless a reviewer objects:

- Color-to-role mapping (`design-system.md` §2): primary brown as primary text/dark-section/CTA fill; gold as accent/icon/border/large-display/text-on-dark only; cream as secondary surface; the two mid-tone browns as secondary/tertiary text.
- Typography scale mapping (`design-system.md` §3) applying Almarai's four weights across Display/H1–H4/Body/Buttons/Prices/etc.
- Favicon = Icon-based logo variant.
- Primary button = solid dark-brown fill + white text (directly evidenced by the app mockup, p.12).
- Price display = Extra-Bold current price + smaller struck-through compare-at price (directly evidenced by p.11–12).
- The ghosted palm/diamond pattern as a low-opacity background accent in specific, restrained contexts (empty states, homepage story section) — never across functional/transactional content.
- Real palm-frond styling as a photography prop direction for hero/lifestyle imagery.
- Five category visual worlds sharing one system, differing only in imagery/story content (`brand-to-ui.md` §3).
- RTL/interaction behavior continuing to follow the already-approved `../ux/ux-specification.md`, explicitly overriding the brand PDF's own (non-RTL-adapted) app mockup on this one point.

## C. Things that require brand-owner approval

Not decided here — flagged specifically because this stage went beyond what the PDF shows, or found a gap/discrepancy the PDF doesn't resolve:

- ~~**Currency discrepancy**~~ — **Resolved in Phase 1.** Confirmed by direct business input: EGP (Egyptian Pound) is the current, runtime website currency. The brand guide's Saudi Riyal mockup pricing is legacy context from an earlier period when the business operated in Saudi Arabia — not the target currency. `src/domain/money.ts` implements `Money` with EGP as the default `CurrencyCode`, integer piasters as the minor unit, per `docs/architecture/technical-architecture.md` §13.
- **Semantic (success/error) color palette** — entirely absent from the brand guide; a digital-only addition proposed in `design-system.md` §2, kept deliberately separate from the brand palette until approved. **Implemented this phase with concrete values** (`src/app/globals.css`'s `--color-feedback-*` tokens, in their own namespace, never merged into the brand palette): success `#4B7355`/bg `#E8EFE6`, warning `#B5651D`/bg `#F7EBDA`, danger `#9C4A3C`/bg `#F5E6E3` — muted, warm-leaning tones chosen to read as "part of this brand's world" rather than generic traffic-light red/green, but still not brand-sourced and still pending sign-off.
- **Motion design system** (`design-system.md` §10) — not sourced from the brand guide at all (a static deck has no motion content); grounded in the brand's tone but not confirmed by the brand owner.
- **Light-weight Almarai usage restriction** (small text avoided) — a legibility recommendation, not a rule stated in the guide; the guide's own type specimen doesn't show Light applied to small body text either way.
- ~~**General-purpose icon set**~~ — **Resolved in Phase 2 as the anticipated implementation-time choice** (this item always allowed either path). Adopted `lucide-react`: a single-weight outline set (no filled/duotone/emoji styles mixed in) that reads as restrained rather than decorative, matching the brand's own minimal mark-making. Not brand-sourced, so still not an "official" system in the way the logo/colors/type are — a brand-owner icon language would take precedence if one is ever specified.
- **Layout/grid system** (`design-system.md` §6) — entirely a digital construction, since a print/social deck has no web grid; consistent with the brand's tone but not literally sourced from it.
- **Shadow color/style** (warm-tinted, §5) — a recommendation, not shown anywhere in the source.

## D. Things intentionally deferred

Not needed at this stage, with the condition that would trigger revisiting:

| Deferred | Trigger to revisit |
|---|---|
| Splash/loading-screen logo treatment | Only relevant if a splash moment is later designed into the frontend — not assumed to exist |
| Per-category accent-color variation | Would only be considered if the brand owner explicitly wants categories visually differentiated beyond imagery — currently rejected per the task's own "one brand" instruction |
| Dark-mode (system-preference) theming for the live site | Not requested anywhere in requirements/UX; the "dark sections" in this document are art-direction choices (footer, Products Experience), not a user-toggleable theme |
| Final exact type scale in px/rem | A design-system implementation detail, once real content and device testing exist — the relative scale in `design-system.md` §3 is binding, the exact numbers are not fixed here |
| Exact spacing-scale numeric values | Same reasoning — the *system* (one consistent scale) is fixed, the numbers are an implementation-time decision |

---

## Consistency check

Performed against `../architecture/blueprint.md`, `../architecture/architecture-decisions.md`, `../architecture/technical-architecture.md`, `../architecture/module-boundaries.md`, `../architecture/data-ownership.md`, `../architecture/technical-decisions.md`, `../requirements/website-functional-requirements.md`, `../ux/ux-specification.md`, `../ux/customer-journeys.md`, `../ux/ux-decisions.md`, and the brand guideline PDF itself.

### Findings

1. **No branding contradiction.** Every color, typeface, and logo usage rule in `design-system.md` traces to a specific PDF page; nothing was invented and labeled as official. The one place this project's own UX spec deliberately overrides an aspect of a brand-guide mockup (RTL interaction direction in the app mockup, p.11–12) is explicitly called out as such, not silently overridden.

2. **No UX contradiction.** `design-system.md` and `brand-to-ui.md` translate the already-approved page structure, navigation behavior, component set, and responsive breakpoints (`../ux/ux-specification.md`) into visual treatment only — no page was added, removed, or restructured, and no interaction pattern was changed.

3. **No architectural contradiction.** Nothing here touches data ownership, module boundaries, or adapter design — this stage is presentation-layer only, consistent with `../architecture/module-boundaries.md`'s rule that Storefront/Content never become a source of truth for anything.

4. **No MVP creep.** No new page, feature, or component was introduced beyond what `../requirements/website-functional-requirements.md` and `../ux/ux-specification.md` already scoped. The five category visual worlds explicitly reject per-category structural variation (§B above) specifically to avoid scope growth into "five microsites."

5. **No invented brand claims.** Product authenticity/origin/quality content remains marked as business-supplied in every document that touches it (`../requirements/website-functional-requirements.md` §15, restated here in `brand-to-ui.md` §2) — this stage adds no testimonial, guarantee, or factual claim about the business.

6. **No arbitrary colors.** Every color token in `design-system.md` §2 is one of the seven official hex values; the one addition (semantic success/error colors) is explicitly flagged as non-brand and pending approval (§C above), never presented as if it were part of the palette.

7. **No arbitrary typography.** Only Almarai is used, in only its four official weights.

8. **No redesigned logo.** Confirmed in §A above — all three official variants used exactly as provided, construction grid and clear-space respected.

9. **No unnecessary UI complexity.** The component visual language (`design-system.md` §7) and motion system (§10) both explicitly list what to avoid (gimmicky effects, animation everywhere, gold-heavy text-bearing surfaces) precisely to keep the system as restrained as the brand's own real applications demonstrate.

10. **New discrepancy found (not present in any prior document): currency.** The brand guide's mockup pricing is in Saudi Riyal; `../architecture/technical-architecture.md` §13 assumes Egyptian Pound. Neither document resolves this — flagged in §C above rather than silently picking one.

11. **New gap found (not a contradiction): no brand-specified motion, layout grid, or icon language exists at all.** Sections §5/§6/§10 of `design-system.md` and the "iconography" row of `brand-to-ui.md` §4 are therefore necessarily digital recommendations rather than extractions — flagged individually rather than presented as if sourced.

### Outcome

No blocking conflicts. One new business-facing discrepancy was found (currency) and is added to the project's open-questions tracking via this document rather than resolved unilaterally; it should be read alongside the existing open-questions lists in `../requirements/website-functional-requirements.md` §25 and `../ux/ux-decisions.md` §B.

---

## Phase 2 consistency check

Performed against this document and `design-system.md` themselves, now that both have been translated into actual code (`src/app/globals.css`, `src/ui/primitives/`, `src/ui/commerce/`).

### Findings (Phase 2)

1. **Token values match the documented mapping exactly.** Every semantic color/type/radius/shadow token in `globals.css` traces one-for-one to `design-system.md` §2/§3/§5 — no new brand color, no new typeface, no undocumented radius/shadow value was introduced during implementation.
2. **Gold-as-text-on-light avoided, per §2's own contrast finding.** `design-system.md` §2 documents that gold fails contrast on light backgrounds (~2.3:1) and passes only on dark (~6:1). The implemented `--color-accent` token is used for icons/borders/on-dark text/large-display treatments in the primitives built so far, never as small body text on a light surface — no primitive violates the rule its own source document derived.
3. **Card `surface` prop enforces §7's alternation rule at the type level.** `design-system.md` §7 requires primary/secondary surfaces to alternate rather than stack identically. The `Card` primitive's `surface: "primary" | "secondary"` prop makes the two options explicit and equally easy to reach for, rather than defaulting to one and leaving alternation to author discipline — a small implementation detail worth recording because it's a real (if minor) design decision, not just a translation of one.
4. **Semantic feedback colors given concrete values (see §C above), not left abstract.** Recorded there rather than duplicated here.
5. **Icon set resolved (see §C above), not left as an open item.** Recorded there rather than duplicated here.
6. **No cartoon/decorative rendering anywhere in the primitives.** The non-negotiable visual-language rule (`design-system.md`, Phase 1 addition) mainly constrains future photography/Products-Experience content, which Phase 2 doesn't touch — but it also implicitly rules out illustrative/mascot-style iconography, which the plain outline `lucide-react` set (finding above, §C) satisfies by construction.

### Outcome (Phase 2)

No conflicts found between the implemented design system and its own source documents. Two previously-open items (§C) were resolved within the authority this stage already had; nothing was decided that required brand-owner sign-off beyond what was already flagged.
