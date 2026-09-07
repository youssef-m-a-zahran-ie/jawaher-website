"use client";

import { useState } from "react";

import { Accordion } from "@/ui/primitives/accordion";
import { Button } from "@/ui/primitives/button";
import { Drawer } from "@/ui/primitives/drawer";
import { Modal } from "@/ui/primitives/modal";
import { useToast } from "@/ui/primitives/toast";
import { ProductCard } from "@/ui/commerce/product-card";
import { QuantityControl } from "@/ui/commerce/quantity-control";
import { MOCK_PRODUCTS } from "@/ui/commerce/mock-products";

/**
 * The one client-side island on the showcase page — everything that needs
 * local state (open/closed dialogs, the toast trigger, the quantity demo)
 * lives here so the rest of the page stays server-rendered.
 */
export function ShowcaseInteractive() {
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { show } = useToast();

  return (
    <div className="flex flex-col gap-12">
      <section>
        <h2 className="mb-4 text-h3">Dialog / Drawer / Toast</h2>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setModalOpen(true)}>فتح نافذة (Modal)</Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            فتح درج (Drawer)
          </Button>
          <Button
            variant="ghost"
            onClick={() => show({ title: "تمت الإضافة إلى السلة", variant: "success" })}
          >
            إظهار إشعار نجاح
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              show({
                title: "تعذر إتمام العملية",
                description: "برجاء المحاولة مرة أخرى.",
                variant: "danger",
              })
            }
          >
            إظهار إشعار خطأ
          </Button>
        </div>

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="مثال Modal">
          <p className="text-body-sm text-text-secondary">
            هذا محتوى تجريبي داخل نافذة منبثقة مبنية على عنصر dialog الأصلي — يشمل ذلك إغلاقًا
            تلقائيًا بمفتاح Escape وحصر التركيز (focus trap) دون أي كود إضافي.
          </p>
        </Modal>

        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="مثال Drawer">
          <p className="text-body-sm text-text-secondary">
            يفتح هذا الدرج من جهة بداية القراءة (اليمين في العربية) — انظر
            docs/ux/ux-specification.md §9.
          </p>
        </Drawer>
      </section>

      <section>
        <h2 className="mb-4 text-h3">Accordion</h2>
        <div className="max-w-lg rounded-lg border border-border px-4">
          <Accordion
            items={[
              { id: "a", title: "ما هي مدة التوصيل؟", content: "محتوى تجريبي للعرض فقط.", defaultOpen: true },
              { id: "b", title: "هل يوجد دفع عند الاستلام؟", content: "محتوى تجريبي للعرض فقط." },
              { id: "c", title: "كيف أتتبع طلبي؟", content: "محتوى تجريبي للعرض فقط." },
            ]}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-h3">Quantity control</h2>
        <QuantityControl value={quantity} onChange={setQuantity} max={10} />
      </section>

      <section>
        <h2 className="mb-4 text-h3">Product card — with quick-add wired to the toast</h2>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          {MOCK_PRODUCTS.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onQuickAdd={(p) => show({ title: `أُضيف "${p.name}" إلى السلة`, variant: "success" })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
