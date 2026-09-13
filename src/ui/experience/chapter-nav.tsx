import type { ExperienceChapter } from "@/ui/experience/chapters";

export type ChapterNavProps = { chapters: ExperienceChapter[] };

/**
 * A quiet, always-available way to jump directly to any chapter
 * (ux-specification.md §16 item 6's "persistent 5-chapter selector") —
 * plain anchor links, no JS required. Hidden on mobile per
 * design-system.md §11 ("decorative brand elements recede first on small
 * screens, not shrink") — on mobile the ordinary scroll + each chapter's
 * own "الفصل التالي" link already cover this need without spending scarce
 * width on a persistent side rail.
 */
export function ChapterNav({ chapters }: ChapterNavProps) {
  return (
    <nav
      aria-label="فصول تجربة المنتجات"
      className="fixed top-1/2 end-4 z-[var(--z-sticky)] hidden -translate-y-1/2 flex-col items-end gap-3 lg:flex"
    >
      {chapters.map((chapter) => (
        <a
          key={chapter.category}
          href={`#chapter-${chapter.category}`}
          className="group flex items-center gap-2 no-underline"
        >
          <span className="pointer-events-none whitespace-nowrap rounded-md bg-surface-dark px-2 py-1 text-caption font-bold text-text-on-dark opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
            {chapter.name}
          </span>
          <span className="size-2.5 rounded-full bg-accent/50 transition-transform duration-150 group-hover:scale-125 group-focus-visible:scale-125" />
        </a>
      ))}
    </nav>
  );
}
