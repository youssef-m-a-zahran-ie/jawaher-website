/**
 * Foundation-only footer — see header.tsx for why this stays minimal.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-black/10 px-6 py-4 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
      <p>© {year} جواهر الخير. جميع الحقوق محفوظة.</p>
    </footer>
  );
}
