import { PageContainer } from "@/ui/primitives/page-container";

/**
 * Foundation-only header: proves the RTL shell + design tokens render
 * correctly. This is NOT the real header — no logo asset exists yet (see
 * docs/design/asset-manifest.md), and navigation links are intentionally
 * omitted rather than linking to pages that don't exist. Real navigation
 * is a Frontend-phase concern (docs/architecture/blueprint.md §19),
 * following docs/ux/ux-specification.md §3.
 */
export function Header() {
  return (
    <header className="border-b border-border">
      <PageContainer className="py-4">
        <span className="text-h4 font-extrabold text-text-primary">جواهر الخير</span>
      </PageContainer>
    </header>
  );
}
