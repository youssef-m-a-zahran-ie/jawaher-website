import type { CategorySlug } from "@/ui/commerce/categories";

export type ExperienceChapter = {
  category: CategorySlug;
  /** Arabic category name — matches the real `Category.name` for this slug (Category Catalog Reconnection). */
  name: string;
  /** requirements/website-functional-requirements.md §"storytelling objective" table — quoted, not paraphrased, per category. */
  storytellingObjective: string;
  /** The chapter's single-line key message (design-system.md §9) — brand voice, never a factual/certification claim. */
  keyMessage: string;
  /** A short scene-setting line for the opening beat — evocative, not a factual claim about sourcing/origin details this project doesn't have. */
  openingLine: string;
};

/**
 * The five chapters, in the brand's own dates-first order (design-system.md
 * §0: "the brand is dates-first... the tagline itself frames the other four
 * categories as the 'and more'"). Content here is deliberately restrained:
 * a mood line and a key message per category, never an invented origin,
 * certification, or production claim (this phase's brief §16). The
 * storytelling objective column is quoted directly from
 * requirements/website-functional-requirements.md's own table — not
 * reinvented here.
 */
export const EXPERIENCE_CHAPTERS: ExperienceChapter[] = [
  {
    category: "dates",
    name: "تمور",
    storytellingObjective: "Provenance and freshness — من النخلة إلى مائدتك",
    keyMessage: "من النخلة، إلى جواهر الخير",
    openingLine: "الاسم نفسه يبدأ من هنا — تُمُور وأكثر.",
  },
  {
    category: "honey",
    name: "عسل",
    storytellingObjective: "Purity and natural sourcing — من الزهرة إلى المرطبان، دون تدخل",
    keyMessage: "نقاء لا يُصنع، يُستخرج",
    openingLine: "قطرة عسل تحمل موسمًا كاملًا من العمل الهادئ.",
  },
  {
    category: "oils",
    name: "زيوت",
    storytellingObjective: "Extraction quality and purity",
    keyMessage: "نقاء يُقاس بالعين قبل اللسان",
    openingLine: "زيت صافٍ، دون خلط ودون تنازل.",
  },
  {
    category: "nuts",
    name: "مكسرات",
    storytellingObjective: "Freshness and careful selection/roasting",
    keyMessage: "اختيار دقيق، لكل حبة",
    openingLine: "القرمشة الصحيحة تبدأ من الاختيار، لا من التحميص فقط.",
  },
  {
    category: "ghee",
    name: "سمن",
    storytellingObjective: "Traditional craft and richness",
    keyMessage: "حرفة تقليدية، بلا اختصارات",
    openingLine: "غنى في القوام، وأصالة في الطريقة.",
  },
];
