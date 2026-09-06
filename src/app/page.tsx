/**
 * Foundation placeholder — proves the RTL shell + typography render
 * correctly. This is deliberately NOT the real homepage: that belongs to
 * the Frontend phase, built against docs/ux/ux-specification.md §4 and the
 * real brand assets once supplied (docs/design/asset-manifest.md).
 */
export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-3xl font-extrabold">جواهر الخير</h1>
      <p className="text-black/60 dark:text-white/60">
        الموقع قيد التطوير — هذه واجهة أساسية مؤقتة.
      </p>
    </div>
  );
}
