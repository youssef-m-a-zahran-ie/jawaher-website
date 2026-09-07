import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Foundation-only footer — see header.tsx for why this stays minimal.
 * Dark surface + text-on-dark: the one sitewide section expected to use
 * the brand's dark background by default (docs/design/design-system.md §7).
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-surface-dark">
      <PageContainer className="py-6">
        <p className="text-body-sm text-text-on-dark">© {year} جواهر الخير. جميع الحقوق محفوظة.</p>
      </PageContainer>
    </footer>
  );
}
