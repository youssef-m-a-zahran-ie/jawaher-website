import { Money } from "@/domain/money";
import type { ProductCardData } from "@/ui/commerce/types";

/**
 * DEV/DEMO DATA ONLY — not real Jawaher Al Khair product information.
 * Used solely to visually develop and showcase ProductCard/PriceDisplay
 * (docs/planning/... Phase 2 task: "Do not invent final product
 * information"). Category names are real (the five approved categories);
 * everything else — names, prices, stock state — is a placeholder and
 * must never be read as an actual catalog. Never imported from
 * src/app/(storefront) once that exists.
 */
export const MOCK_PRODUCTS: ProductCardData[] = [
  {
    id: "mock-1",
    slug: "mock-dates-sample",
    name: "تمر (اسم تجريبي)",
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
    slug: "mock-honey-sample",
    name: "عسل (اسم تجريبي)",
    category: "عسل",
    price: Money.fromDecimalString("310.00"),
    availability: "low_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — عسل",
  },
  {
    id: "mock-3",
    slug: "mock-oils-sample",
    name: "زيت (اسم تجريبي)",
    category: "زيوت",
    price: Money.fromDecimalString("145.00"),
    availability: "in_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — زيت",
  },
  {
    id: "mock-4",
    slug: "mock-nuts-sample",
    name: "مكسرات (اسم تجريبي)",
    category: "مكسرات",
    price: Money.fromDecimalString("210.00"),
    availability: "out_of_stock",
    hasMultipleVariants: false,
    imageAlt: "صورة تجريبية — مكسرات",
  },
  {
    id: "mock-5",
    slug: "mock-ghee-sample",
    name: "سمن (اسم تجريبي)",
    category: "سمن",
    price: Money.fromDecimalString("260.00"),
    availability: "in_stock",
    hasMultipleVariants: true,
    imageAlt: "صورة تجريبية — سمن",
  },
];
