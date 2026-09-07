import { Money } from "@/domain/money";
import type { ProductCardData } from "@/ui/commerce/types";

/**
 * DEV/DEMO DATA ONLY — not real Jawaher Al Khair product information.
 * Used to populate the Shop/Category/Home grids built in Phase 3 with
 * something visually real to lay out against, per
 * docs/planning/feature-completeness-audit.md's "do not invent final
 * product information" rule. Category names are real (the five approved
 * categories, matching src/ui/commerce/categories.ts exactly); everything
 * else — names, prices, stock state, "best seller" badges — is a
 * placeholder and must never be read as an actual catalog. Never imported
 * from anywhere outside src/app/(storefront) and the dev showcase.
 */
export const MOCK_PRODUCTS: ProductCardData[] = [
  {
    id: "mock-1",
    slug: "mock-dates-sample",
    name: "تمر مجدول (اسم تجريبي)",
    category: "تمور",
    price: Money.fromDecimalString("185.00"),
    compareAtPrice: Money.fromDecimalString("220.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — تمر",
    badge: { label: "الأكثر مبيعًا", variant: "accent" },
  },
  {
    id: "mock-2",
    slug: "mock-dates-sample-2",
    name: "تمر سكري (اسم تجريبي)",
    category: "تمور",
    price: Money.fromDecimalString("165.00"),
    availability: "in_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — تمر",
  },
  {
    id: "mock-3",
    slug: "mock-dates-sample-3",
    name: "تمر عجوة (اسم تجريبي)",
    category: "تمور",
    price: Money.fromDecimalString("240.00"),
    availability: "low_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — تمر",
  },
  {
    id: "mock-4",
    slug: "mock-honey-sample",
    name: "عسل سدر (اسم تجريبي)",
    category: "عسل",
    price: Money.fromDecimalString("310.00"),
    availability: "low_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — عسل",
    badge: { label: "الأكثر مبيعًا", variant: "accent" },
  },
  {
    id: "mock-5",
    slug: "mock-honey-sample-2",
    name: "عسل نحل بلدي (اسم تجريبي)",
    category: "عسل",
    price: Money.fromDecimalString("275.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — عسل",
  },
  {
    id: "mock-6",
    slug: "mock-honey-sample-3",
    name: "عسل زهور (اسم تجريبي)",
    category: "عسل",
    price: Money.fromDecimalString("260.00"),
    compareAtPrice: Money.fromDecimalString("300.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — عسل",
  },
  {
    id: "mock-7",
    slug: "mock-oils-sample",
    name: "زيت زيتون (اسم تجريبي)",
    category: "زيوت",
    price: Money.fromDecimalString("145.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — زيت",
    badge: { label: "الأكثر مبيعًا", variant: "accent" },
  },
  {
    id: "mock-8",
    slug: "mock-oils-sample-2",
    name: "زيت حبة البركة (اسم تجريبي)",
    category: "زيوت",
    price: Money.fromDecimalString("120.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — زيت",
  },
  {
    id: "mock-9",
    slug: "mock-oils-sample-3",
    name: "زيت سمسم (اسم تجريبي)",
    category: "زيوت",
    price: Money.fromDecimalString("135.00"),
    availability: "out_of_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — زيت",
  },
  {
    id: "mock-10",
    slug: "mock-nuts-sample",
    name: "لوز (اسم تجريبي)",
    category: "مكسرات",
    price: Money.fromDecimalString("210.00"),
    availability: "out_of_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — مكسرات",
  },
  {
    id: "mock-11",
    slug: "mock-nuts-sample-2",
    name: "كاجو (اسم تجريبي)",
    category: "مكسرات",
    price: Money.fromDecimalString("230.00"),
    availability: "in_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — مكسرات",
    badge: { label: "الأكثر مبيعًا", variant: "accent" },
  },
  {
    id: "mock-12",
    slug: "mock-nuts-sample-3",
    name: "فستق (اسم تجريبي)",
    category: "مكسرات",
    price: Money.fromDecimalString("255.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — مكسرات",
  },
  {
    id: "mock-13",
    slug: "mock-ghee-sample",
    name: "سمن بلدي (اسم تجريبي)",
    category: "سمن",
    price: Money.fromDecimalString("260.00"),
    availability: "in_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — سمن",
    badge: { label: "الأكثر مبيعًا", variant: "accent" },
  },
  {
    id: "mock-14",
    slug: "mock-ghee-sample-2",
    name: "سمن جاموسي (اسم تجريبي)",
    category: "سمن",
    price: Money.fromDecimalString("290.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — سمن",
  },
  {
    id: "mock-15",
    slug: "mock-ghee-sample-3",
    name: "سمن نباتي (اسم تجريبي)",
    category: "سمن",
    price: Money.fromDecimalString("150.00"),
    availability: "low_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — سمن",
  },
];

/** Curated (not sales-ranked) pre-launch "best sellers" set — ux-specification.md §4 row 3 explicitly allows this pattern before real order data exists. One per category, dates-first per the business's sales-mix guidance, all five still represented. */
export const MOCK_BEST_SELLERS: ProductCardData[] = MOCK_PRODUCTS.filter((product) =>
  Boolean(product.badge),
);

export function getMockProductBySlug(slug: string): ProductCardData | undefined {
  return MOCK_PRODUCTS.find((product) => product.slug === slug);
}

export function getMockProductsByCategoryName(categoryName: string): ProductCardData[] {
  return MOCK_PRODUCTS.filter((product) => product.category === categoryName);
}
