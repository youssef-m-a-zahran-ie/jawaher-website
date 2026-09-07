import { notFound } from "next/navigation";

import { Money } from "@/domain/money";
import { Badge } from "@/ui/primitives/badge";
import { Breadcrumb } from "@/ui/primitives/breadcrumb";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Divider } from "@/ui/primitives/divider";
import { EmptyState } from "@/ui/primitives/empty-state";
import { ErrorState } from "@/ui/primitives/error-state";
import { IconButton } from "@/ui/primitives/icon-button";
import { ImagePlaceholder } from "@/ui/primitives/image-placeholder";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";
import { Radio } from "@/ui/primitives/radio";
import { Select } from "@/ui/primitives/select";
import { Skeleton } from "@/ui/primitives/skeleton";
import { Switch } from "@/ui/primitives/switch";
import { Tag } from "@/ui/primitives/tag";
import { Textarea } from "@/ui/primitives/textarea";
import { Tooltip } from "@/ui/primitives/tooltip";
import { PriceDisplay } from "@/ui/commerce/price-display";
import { Heart, Search } from "lucide-react";

import { ShowcaseInteractive } from "./showcase-interactive";

/**
 * Internal Phase 2 design-system showcase — NOT the public homepage.
 * Excluded from production builds entirely (see the guard below), per the
 * "do not expose development information in production" instruction.
 */
export default function DesignSystemShowcasePage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <PageContainer className="flex flex-col gap-16 py-12">
      <header>
        <p className="text-caption font-bold uppercase tracking-wide text-accent">
          Phase 2 — Development Only
        </p>
        <h1 className="text-display font-extrabold text-text-primary">Design System Showcase</h1>
        <p className="mt-2 max-w-2xl text-body text-text-secondary">
          كل عنصر هنا مبني على رموز التصميم الرسمية (docs/design/design-system.md) — هذه ليست
          الصفحة الرئيسية النهائية، بل سطح تطوير لمراجعة المكوّنات القابلة لإعادة الاستخدام.
        </p>
      </header>

      <Section title="Typography">
        <div className="flex flex-col gap-3">
          <p className="text-display font-extrabold">Display — جواهر الخير</p>
          <p className="text-h1 font-extrabold">H1 — من التمر إلى مائدتكم</p>
          <p className="text-h2 font-bold">H2 — فئاتنا الخمس</p>
          <p className="text-h3 font-bold">H3 — تمور، عسل، زيوت، مكسرات، سمن</p>
          <p className="text-h4 font-bold">H4 — تفاصيل المنتج</p>
          <p className="text-body-lg">Body Large — نص تعريفي أطول قليلًا من النص الأساسي.</p>
          <p className="text-body">Body — النص الأساسي المستخدم في معظم الواجهة.</p>
          <p className="text-body-sm text-text-secondary">Body Small — نص ثانوي أو وصف مساعد.</p>
          <p className="text-caption text-text-tertiary">Caption — تسميات صغيرة وطوابع زمنية.</p>
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ColorSwatch name="brand-brown" varName="--color-brand-brown" />
          <ColorSwatch name="brand-brown-dark" varName="--color-brand-brown-dark" />
          <ColorSwatch name="brand-brown-mid" varName="--color-brand-brown-mid" />
          <ColorSwatch name="brand-gold" varName="--color-brand-gold" />
          <ColorSwatch name="brand-cream" varName="--color-brand-cream" />
          <ColorSwatch name="feedback-success" varName="--color-feedback-success" />
          <ColorSwatch name="feedback-warning" varName="--color-feedback-warning" />
          <ColorSwatch name="feedback-danger" varName="--color-feedback-danger" />
        </div>
        <p className="mt-3 text-body-sm text-text-secondary">
          الألوان السبعة الأولى رسمية من دليل العلامة. ألوان success/warning/danger توصية رقمية
          بانتظار موافقة صاحب العلامة (docs/design/design-decisions.md §C).
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">أساسي</Button>
          <Button variant="secondary">ثانوي</Button>
          <Button variant="ghost">شفاف</Button>
          <Button variant="danger">خطر</Button>
          <Button loading>جارٍ التحميل</Button>
          <Button disabled>معطّل</Button>
          <Button size="sm">صغير</Button>
          <Button size="lg">كبير</Button>
          <IconButton icon={<Heart className="size-5" />} aria-label="أضف للمفضلة" />
          <Tooltip content="بحث">
            <IconButton icon={<Search className="size-5" />} aria-label="بحث" />
          </Tooltip>
        </div>
      </Section>

      <Section title="Forms">
        <div className="grid max-w-xl gap-5">
          <div>
            <Label htmlFor="demo-name">الاسم</Label>
            <Input id="demo-name" placeholder="اكتب اسمك" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="demo-phone" required>
              رقم الهاتف
            </Label>
            <Input id="demo-phone" placeholder="01xxxxxxxxx" invalid className="mt-1.5" />
            <p className="mt-1 text-caption text-danger">تحقق من رقم الهاتف — تأكد من إدخال 11 رقمًا</p>
          </div>
          <div>
            <Label htmlFor="demo-notes">ملاحظات التوصيل</Label>
            <Textarea id="demo-notes" placeholder="مثال: بجانب الصيدلية" className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="demo-city">المحافظة</Label>
            <Select id="demo-city" className="mt-1.5" defaultValue="">
              <option value="" disabled>
                اختر المحافظة
              </option>
              <option value="cairo">القاهرة</option>
              <option value="giza">الجيزة</option>
              <option value="alex">الإسكندرية</option>
            </Select>
          </div>
          <Checkbox id="demo-checkbox" label="أوافق على الشروط والأحكام" />
          <div className="flex gap-6">
            <Radio id="demo-radio-1" name="demo-radio" label="الدفع عند الاستلام" defaultChecked />
            <Radio id="demo-radio-2" name="demo-radio" label="دفع إلكتروني" />
          </div>
          <Switch id="demo-switch" label="تلقي إشعارات العروض" defaultChecked />
        </div>
      </Section>

      <Section title="Badges & tags">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">الأكثر مبيعًا</Badge>
          <Badge variant="dark">جديد</Badge>
          <Badge variant="success">متوفر</Badge>
          <Badge variant="warning">ينفد قريبًا</Badge>
          <Badge variant="danger">غير متوفر</Badge>
          <Badge variant="neutral">تصنيف</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag selected>تمور</Tag>
          <Tag>عسل</Tag>
          <Tag>زيوت</Tag>
          <Tag>مكسرات</Tag>
          <Tag>سمن</Tag>
        </div>
      </Section>

      <Section title="Cards & breadcrumb">
        <Breadcrumb items={[{ label: "الرئيسية", href: "#" }, { label: "الفئات", href: "#" }, { label: "تمور" }]} />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="font-bold text-text-primary">بطاقة على خلفية بيضاء</p>
            <p className="mt-1 text-body-sm text-text-secondary">مثال محتوى داخل بطاقة surface=&quot;primary&quot;.</p>
          </Card>
          <Card surface="secondary">
            <p className="font-bold text-text-primary">بطاقة على خلفية كريمية</p>
            <p className="mt-1 text-body-sm text-text-secondary">مثال محتوى داخل بطاقة surface=&quot;secondary&quot;.</p>
          </Card>
        </div>
      </Section>

      <Section title="Price display">
        <div className="flex flex-wrap gap-8">
          <PriceDisplay price={Money.fromDecimalString("124.50")} />
          <PriceDisplay price={Money.fromDecimalString("124.50")} compareAtPrice={Money.fromDecimalString("160.00")} />
          <PriceDisplay price={Money.fromDecimalString("124.50")} size="lg" />
        </div>
      </Section>

      <Section title="Loading, empty & error states">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <p className="text-body-sm font-bold text-text-secondary">Skeleton</p>
            <div className="flex flex-col gap-2">
              <Skeleton className="aspect-square w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div>
            <p className="mb-3 text-body-sm font-bold text-text-secondary">Empty state</p>
            <Card padding="none">
              <EmptyState
                title="السلة فارغة"
                description="لم تتم إضافة أي منتجات بعد."
                action={<Button size="sm">تسوق الآن</Button>}
              />
            </Card>
          </div>
          <div>
            <p className="mb-3 text-body-sm font-bold text-text-secondary">Error state</p>
            <Card padding="none">
              <ErrorState
                title="حدث خطأ غير متوقع"
                description="برجاء المحاولة مرة أخرى."
                reference="ref-demo-1234"
                action={
                  <Button size="sm" variant="secondary">
                    إعادة المحاولة
                  </Button>
                }
              />
            </Card>
          </div>
        </div>
      </Section>

      <Section title="Image placeholder">
        <div className="max-w-40">
          <ImagePlaceholder label="لا توجد صورة منتج حقيقية بعد" />
        </div>
      </Section>

      <Section title="Interactive: dialog, drawer, toast, accordion, quantity, product card">
        <ShowcaseInteractive />
      </Section>

      <Section title="RTL / LTR comparison">
        <p className="mb-4 max-w-2xl text-body-sm text-text-secondary">
          نفس المكوّن، معروض تحت اتجاهين مختلفين للتأكد من أن كل شيء يعتمد على خصائص منطقية
          (start/end) وليس يمين/يسار ثابتين.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div dir="rtl" className="rounded-lg border border-border p-4">
            <p className="mb-2 text-caption font-bold text-text-tertiary">dir=&quot;rtl&quot;</p>
            <Breadcrumb items={[{ label: "الرئيسية", href: "#" }, { label: "تمور" }]} />
            <Divider className="my-3" />
            <div className="flex items-center justify-between">
              <Label htmlFor="rtl-demo">حقل نصي</Label>
              <Link href="#">رابط</Link>
            </div>
            <Input id="rtl-demo" placeholder="حقل تجريبي" className="mt-1.5" />
          </div>
          <div dir="ltr" className="rounded-lg border border-border p-4 text-left">
            <p className="mb-2 text-caption font-bold text-text-tertiary">dir=&quot;ltr&quot;</p>
            <Breadcrumb items={[{ label: "Home", href: "#" }, { label: "Dates" }]} />
            <Divider className="my-3" />
            <div className="flex items-center justify-between">
              <Label htmlFor="ltr-demo">Text field</Label>
              <Link href="#">Link</Link>
            </div>
            <Input id="ltr-demo" placeholder="Sample field" className="mt-1.5" />
          </div>
        </div>
      </Section>
    </PageContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-h3">{title}</h2>
      {children}
    </section>
  );
}

function ColorSwatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="h-16 w-full" style={{ backgroundColor: `var(${varName})` }} />
      <p className="px-2 py-1.5 text-caption text-text-secondary">{name}</p>
    </div>
  );
}
