# Jawaher Al Khair — Asset Manifest

Where every asset type belongs under `_reference/`, what currently exists, and naming expectations for anything supplied later. Companion to [`design-system.md`](./design-system.md) and [`brand-to-ui.md`](./brand-to-ui.md).

Status: **Stage 0.95.** Last updated: 2026-09-06.

---

## 1. Current inventory

| Asset type | Location | Currently supplied? |
|---|---|---|
| Brand guideline PDF | `_reference/brand/guidelines/Jawaher El khier.pdf` | **Yes** — 16 pages, the source for every finding in `design-system.md`/`brand-to-ui.md` |
| Logo files (extracted, editable/vector) | `_reference/brand/logo/` | **No** — the logo is currently only visible embedded inside the PDF; no standalone `.svg`/`.ai`/`.eps`/transparent `.png` files exist yet |
| Font files | `_reference/brand/fonts/` | **No** — Almarai is a known, freely available Google Font (see `design-system.md` §3), so this is a lower-priority gap than the logo files, but self-hosted font files should still be supplied or sourced before implementation |
| Color reference files | `_reference/brand/colors/` | **No** — not needed separately; the seven hex values are fully documented in `design-system.md` §2 directly from the PDF |
| Other brand references (packaging, banners, social templates as standalone files) | `_reference/brand/references/` | **No** — these exist only as mockup pages inside the PDF (pp.9–15), not as separate reusable files |
| Product catalog data (Excel/CSV/PDF lists) | `_reference/products/catalog/` | **No** |
| Product photography — dates | `_reference/products/images/dates/` | **No** |
| Product photography — honey | `_reference/products/images/honey/` | **No** |
| Product photography — oils | `_reference/products/images/oils/` | **No** |
| Product photography — nuts | `_reference/products/images/nuts/` | **No** |
| Product photography — ghee | `_reference/products/images/ghee/` | **No** |
| Packaging photography | `_reference/products/packaging/` | **No** |
| Products Experience assets (per category) | `_reference/experience/<category>/` | **No** |

**The single biggest asset gap:** real product photography does not exist anywhere in this project yet, for any of the five categories (`brand-to-ui.md` §2). This blocks final PDP/Shop/category visual implementation regardless of how complete the design system documentation is.

---

## 2. Where each asset type belongs (reference table)

| Asset | Belongs in |
|---|---|
| Logo (all variants, vector + transparent raster) | `_reference/brand/logo/` |
| Brand guideline PDF (and any future updated version) | `_reference/brand/guidelines/` |
| Font files (if self-hosting rather than using Google Fonts directly) | `_reference/brand/fonts/` |
| Official color reference (if a standalone swatch file is ever produced) | `_reference/brand/colors/` |
| Social media templates, banners, packaging mockups, billboard references (as standalone files, if extracted from the PDF or newly produced) | `_reference/brand/references/` |
| Product catalog lists (Excel/CSV/PDF) | `_reference/products/catalog/` |
| Product photography, by category | `_reference/products/images/<category>/` |
| Packaging photography | `_reference/products/packaging/` |
| Other product references (e.g. supplier spec sheets) | `_reference/products/references/` |
| Products Experience visual/video/animation references, by category | `_reference/experience/<category>/` |
| Products Experience shared references (not category-specific) | `_reference/experience/references/` |

---

## 3. Naming expectations for future assets

No naming convention exists yet because no such assets have been supplied — the following is a **recommendation (C-status, per `design-decisions.md`)** to keep future uploads consistent and machine-sortable:

- **Logo files:** `jawaher-logo-<variant>-<background>.<ext>` — e.g. `jawaher-logo-horizontal-on-white.svg`, `jawaher-logo-icon-on-dark.png`. Variant values: `horizontal`, `vertical`, `icon`. Background values: `on-white`, `on-cream`, `on-dark`, `on-black`, `mono`.
- **Product photography:** `<category>-<product-slug>-<view>-<index>.<ext>` — e.g. `dates-majdool-premium-front-01.jpg`, `honey-sidr-jar-detail-02.jpg`. View values: `front`, `detail`, `packaging`, `lifestyle`.
- **Category imagery (Home/Category tiles):** `<category>-hero.<ext>`, `<category>-tile.<ext>`.
- **Products Experience assets:** `<category>-chapter-<beat-number>-<description>.<ext>` — e.g. `honey-chapter-02-bee-flight.json` (a Lottie file), `dates-chapter-01-palm-establishing.mp4`.
- **File format guidance:** vector logo as `.svg` (preferred) with `.png`/`.eps` fallbacks if that's what's available; product photography as high-resolution `.jpg`/`.png` (source quality — website-side optimization/responsive sizing happens at implementation time per `../architecture/technical-architecture.md` §16, not by pre-shrinking source files); Products Experience motion assets as `.json` (Lottie) or `.mp4`/`.webm` (video), per `../architecture/blueprint.md` §17.

This naming scheme is a proposal to make asset intake predictable — it does not require brand-owner approval the way a visual decision would, but the business/content team should be told about it before supplying the first real batch of product photography.
