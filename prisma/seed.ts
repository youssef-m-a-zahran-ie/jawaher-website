// Populates the catalog projection, shipping zones, and one sample coupon
// with clearly-labeled sample data — NOT a fake ERP client, just a
// standard Prisma seed script (see docs/planning/commerce-completeness-audit.md
// §2 for why this is the right way to bootstrap local data while the real
// ERP Adapter sync job doesn't exist yet).
//
// Run via `npx prisma db seed` (wired in prisma.config.ts) or directly:
// `node prisma/seed.ts`. Deliberately uses relative imports and constructs
// its own PrismaClient rather than importing src/lib/db.ts — that file
// imports via the "@/" path alias, which only Next.js's bundler resolves;
// this script runs under Node's native TypeScript support (Node 24+, no
// ts-node/tsx dependency needed — verified empirically against the
// installed Node version) and Node's own module resolution doesn't know
// about tsconfig path aliases.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

const SAMPLE_SUFFIX = " (اسم تجريبي)";

type SeedVariant = { sku: string; label: string; priceEgp: number; compareAtEgp?: number; quantity: number };
type SeedProduct = { slug: string; name: string; description: string; variants: SeedVariant[] };

const CATEGORIES: { slug: string; name: string; sortOrder: number; products: SeedProduct[] }[] = [
  {
    slug: "dates",
    name: "تمور",
    sortOrder: 0,
    products: [
      {
        slug: "mock-dates-sample",
        name: `تمر مجدول${SAMPLE_SUFFIX}`,
        description: "منتج من فئة تمور — من جواهر الخير.",
        variants: [
          { sku: "DATES-MAJDOOL-500", label: "500 جم", priceEgp: 185, compareAtEgp: 220, quantity: 40 },
          { sku: "DATES-MAJDOOL-1000", label: "1 كجم", priceEgp: 340, quantity: 3 },
        ],
      },
      {
        slug: "mock-dates-sample-2",
        name: `تمر سكري${SAMPLE_SUFFIX}`,
        description: "منتج من فئة تمور — من جواهر الخير.",
        variants: [{ sku: "DATES-SUKKARY-500", label: "500 جم", priceEgp: 165, quantity: 25 }],
      },
      {
        slug: "mock-dates-sample-3",
        name: `تمر عجوة${SAMPLE_SUFFIX}`,
        description: "منتج من فئة تمور — من جواهر الخير.",
        variants: [{ sku: "DATES-AJWA-500", label: "500 جم", priceEgp: 240, quantity: 0 }],
      },
    ],
  },
  {
    slug: "honey",
    name: "عسل",
    sortOrder: 1,
    products: [
      {
        slug: "mock-honey-sample",
        name: `عسل سدر${SAMPLE_SUFFIX}`,
        description: "منتج من فئة عسل — من جواهر الخير.",
        variants: [
          { sku: "HONEY-SIDR-250", label: "250 جم", priceEgp: 310, quantity: 4 },
          { sku: "HONEY-SIDR-500", label: "500 جم", priceEgp: 560, quantity: 15 },
        ],
      },
      {
        slug: "mock-honey-sample-2",
        name: `عسل نحل بلدي${SAMPLE_SUFFIX}`,
        description: "منتج من فئة عسل — من جواهر الخير.",
        variants: [{ sku: "HONEY-BALADI-500", label: "500 جم", priceEgp: 275, quantity: 30 }],
      },
    ],
  },
  {
    slug: "oils",
    name: "زيوت",
    sortOrder: 2,
    products: [
      {
        slug: "mock-oils-sample",
        name: `زيت زيتون${SAMPLE_SUFFIX}`,
        description: "منتج من فئة زيوت — من جواهر الخير.",
        variants: [{ sku: "OIL-OLIVE-500", label: "500 مل", priceEgp: 145, quantity: 50 }],
      },
      {
        slug: "mock-oils-sample-2",
        name: `زيت حبة البركة${SAMPLE_SUFFIX}`,
        description: "منتج من فئة زيوت — من جواهر الخير.",
        variants: [{ sku: "OIL-NIGELLA-250", label: "250 مل", priceEgp: 120, quantity: 20 }],
      },
    ],
  },
  {
    slug: "nuts",
    name: "مكسرات",
    sortOrder: 3,
    products: [
      {
        slug: "mock-nuts-sample",
        name: `لوز${SAMPLE_SUFFIX}`,
        description: "منتج من فئة مكسرات — من جواهر الخير.",
        variants: [{ sku: "NUTS-ALMOND-500", label: "500 جم", priceEgp: 210, quantity: 0 }],
      },
      {
        slug: "mock-nuts-sample-2",
        name: `كاجو${SAMPLE_SUFFIX}`,
        description: "منتج من فئة مكسرات — من جواهر الخير.",
        variants: [
          { sku: "NUTS-CASHEW-250", label: "250 جم", priceEgp: 130, quantity: 35 },
          { sku: "NUTS-CASHEW-500", label: "500 جم", priceEgp: 230, quantity: 22 },
        ],
      },
    ],
  },
  {
    slug: "ghee",
    name: "سمن",
    sortOrder: 4,
    products: [
      {
        slug: "mock-ghee-sample",
        name: `سمن بلدي${SAMPLE_SUFFIX}`,
        description: "منتج من فئة سمن — من جواهر الخير.",
        variants: [
          { sku: "GHEE-BALADI-500", label: "500 جم", priceEgp: 260, quantity: 18 },
          { sku: "GHEE-BALADI-1000", label: "1 كجم", priceEgp: 480, quantity: 9 },
        ],
      },
      {
        slug: "mock-ghee-sample-2",
        name: `سمن جاموسي${SAMPLE_SUFFIX}`,
        description: "منتج من فئة سمن — من جواهر الخير.",
        variants: [{ sku: "GHEE-BUFFALO-500", label: "500 جم", priceEgp: 290, quantity: 12 }],
      },
    ],
  },
];

// Placeholder fees — never confirmed by the business. See
// docs/planning/commerce-completeness-audit.md §9.
const SHIPPING_ZONES = [
  { governorate: "القاهرة", feeAmountMinor: 6000, estimateLabel: "2-4 أيام عمل" },
  { governorate: "الجيزة", feeAmountMinor: 6000, estimateLabel: "2-4 أيام عمل" },
  { governorate: "الإسكندرية", feeAmountMinor: 8000, estimateLabel: "3-5 أيام عمل" },
];

async function main() {
  for (const category of CATEGORIES) {
    const categoryRow = await db.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sortOrder: category.sortOrder },
      create: { slug: category.slug, name: category.name, sortOrder: category.sortOrder },
    });

    for (const [productIndex, product] of category.products.entries()) {
      const productRow = await db.product.upsert({
        where: { slug: product.slug },
        update: { name: product.name, description: product.description, categoryId: categoryRow.id },
        create: {
          slug: product.slug,
          name: product.name,
          description: product.description,
          categoryId: categoryRow.id,
          sortOrder: productIndex,
        },
      });

      for (const [variantIndex, variant] of product.variants.entries()) {
        await db.variant.upsert({
          where: { sku: variant.sku },
          update: {
            label: variant.label,
            priceAmountMinor: egpToMinor(variant.priceEgp),
            compareAtAmountMinor: variant.compareAtEgp ? egpToMinor(variant.compareAtEgp) : null,
            inventoryQuantity: variant.quantity,
          },
          create: {
            productId: productRow.id,
            sku: variant.sku,
            label: variant.label,
            priceAmountMinor: egpToMinor(variant.priceEgp),
            compareAtAmountMinor: variant.compareAtEgp ? egpToMinor(variant.compareAtEgp) : null,
            inventoryQuantity: variant.quantity,
            sortOrder: variantIndex,
          },
        });
      }
    }
  }

  for (const zone of SHIPPING_ZONES) {
    await db.shippingZone.upsert({
      where: { governorate: zone.governorate },
      update: { feeAmountMinor: zone.feeAmountMinor, estimateLabel: zone.estimateLabel },
      create: { ...zone, codSupported: true },
    });
  }

  await db.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: { code: "WELCOME10", type: "PERCENTAGE", value: 10, minOrderAmountMinor: egpToMinor(100), usageLimit: 500 },
  });

  console.log("Seed complete: 5 categories, sample products/variants, shipping zones, one coupon.");
}

function egpToMinor(egp: number): number {
  return Math.round(egp * 100);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
