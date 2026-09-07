import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Thin Prisma access only — no business logic (that's service.ts/inventory.ts).
 * Conceptually the ERP-projection read model (data-ownership.md) — writes
 * only happen from prisma/seed.ts this phase (commerce-completeness-audit.md §2).
 */
export const catalogRepository = {
  findCategoryBySlug(slug: string, client: Db = db) {
    return client.category.findUnique({ where: { slug } });
  },

  listCategories(client: Db = db) {
    return client.category.findMany({ orderBy: { sortOrder: "asc" } });
  },

  findProductBySlugWithVariants(slug: string, client: Db = db) {
    return client.product.findUnique({
      where: { slug },
      include: { category: true, variants: { orderBy: { sortOrder: "asc" } } },
    });
  },

  listActiveProductsByCategorySlug(categorySlug: string, client: Db = db) {
    return client.product.findMany({
      where: { status: "ACTIVE", category: { slug: categorySlug } },
      include: { category: true, variants: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
  },

  listAllActiveProducts(client: Db = db) {
    return client.product.findMany({
      where: { status: "ACTIVE" },
      include: { category: true, variants: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
  },

  findVariantById(id: string, client: Db = db) {
    return client.variant.findUnique({ where: { id }, include: { product: { include: { category: true } } } });
  },

  findVariantBySku(sku: string, client: Db = db) {
    return client.variant.findUnique({ where: { sku }, include: { product: { include: { category: true } } } });
  },

  findVariantsByIds(ids: string[], client: Db = db) {
    return client.variant.findMany({ where: { id: { in: ids } } });
  },
};

export type CatalogProductRow = NonNullable<
  Awaited<ReturnType<typeof catalogRepository.findProductBySlugWithVariants>>
>;
export type CatalogVariantRow = CatalogProductRow["variants"][number];
