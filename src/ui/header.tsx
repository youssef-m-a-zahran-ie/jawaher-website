/**
 * Foundation-only header: proves the RTL shell renders correctly. This is
 * NOT the real header — no logo asset exists yet (see docs/design/asset-manifest.md),
 * and navigation links are intentionally omitted rather than linking to
 * pages that don't exist. Real navigation is a Frontend-phase concern
 * (docs/architecture/blueprint.md §19), following docs/ux/ux-specification.md §3.
 */
export function Header() {
  return (
    <header className="border-b border-black/10 px-6 py-4 dark:border-white/15">
      <span className="text-xl font-extrabold">جواهر الخير</span>
    </header>
  );
}
