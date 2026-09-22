import { logger } from "@/lib/logger";
import { catalogService, type CategoryView } from "@/modules/catalog";
import { JawaherPalmIcon } from "@/ui/brand/jawaher-mark";
import { JawaherPattern } from "@/ui/brand/jawaher-pattern";
import { PageContainer } from "@/ui/primitives/page-container";
import { Link } from "@/ui/primitives/link";

const POLICY_LINKS: { slug: string; label: string }[] = [
  { slug: "shipping", label: "سياسة الشحن" },
  { slug: "returns", label: "سياسة الإرجاع" },
  { slug: "payment", label: "سياسة الدفع" },
  { slug: "privacy", label: "سياسة الخصوصية" },
  { slug: "terms", label: "الشروط والأحكام" },
];

const footerLinkClass = "text-body-sm text-text-on-dark/80 no-underline transition-colors hover:text-text-on-dark";

/**
 * Dark surface + text-on-dark: the one sitewide section expected to use
 * the brand's dark background by default (docs/design/design-system.md
 * §7). No phone/email/address/social links appear here — none exist in
 * _reference/business/ yet (docs/design/asset-manifest.md); inventing any
 * of them would be exactly the kind of fabricated business fact this
 * phase's brief forbids. The Contact page (a real form) is the honest
 * stand-in until real contact details are supplied.
 *
 * Category Catalog Reconnection — async, same `catalogService.listCategories()`
 * + try/catch-to-empty-array pattern as `Header` (that component's own
 * comment explains why the fallback is mandatory, not optional: this also
 * renders on every page via the root layout). A failed fetch here means
 * the "الفئات" column simply lists only "كل المنتجات" — never a broken footer.
 */
export async function Footer() {
  const year = new Date().getFullYear();
  const categories = await loadFooterCategories();

  return (
    <footer className="relative overflow-hidden bg-surface-dark">
      <JawaherPattern className="text-text-on-dark" opacity={0.05} />
      <PageContainer className="relative grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2">
            <JawaherPalmIcon className="h-8 w-8 text-accent" />
            <p className="text-h4 font-extrabold text-text-on-dark-strong">جواهر الخير</p>
          </div>
          <p className="mt-2 max-w-xs text-body-sm text-text-on-dark/80">تُمُور وأكثر.</p>
        </div>

        <nav aria-label="الفئات">
          <p className="text-body-sm font-bold text-text-on-dark-strong">الفئات</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            <li>
              <Link href="/shop" className={footerLinkClass}>
                كل المنتجات
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/shop/${category.slug}`} className={footerLinkClass}>
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="الشركة">
          <p className="text-body-sm font-bold text-text-on-dark-strong">الشركة</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            <li>
              <Link href="/about" className={footerLinkClass}>
                من نحن
              </Link>
            </li>
            <li>
              <Link href="/contact" className={footerLinkClass}>
                تواصل معنا
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="السياسات">
          <p className="text-body-sm font-bold text-text-on-dark-strong">السياسات</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {POLICY_LINKS.map((policy) => (
              <li key={policy.slug}>
                <Link href={`/policies/${policy.slug}`} className={footerLinkClass}>
                  {policy.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageContainer>
      <div className="border-t border-border-dark">
        <PageContainer className="py-5">
          <p className="text-caption text-text-on-dark/70">© {year} جواهر الخير. جميع الحقوق محفوظة.</p>
        </PageContainer>
      </div>
    </footer>
  );
}

async function loadFooterCategories(): Promise<CategoryView[]> {
  try {
    return await catalogService.listCategories();
  } catch (err) {
    logger.warn({ err }, "footer: category fetch failed — showing 'كل المنتجات' only");
    return [];
  }
}
