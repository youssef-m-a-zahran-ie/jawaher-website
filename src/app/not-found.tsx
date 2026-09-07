import { Compass } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/ui/primitives/empty-state";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = { title: "الصفحة غير موجودة" };

/** The design-system-styled 404 — never the framework's default page (this phase's brief: "must feel like part of the brand"). */
export default function NotFound() {
  return (
    <PageContainer className="py-24">
      <EmptyState
        icon={<Compass className="size-10" />}
        title="الصفحة غير موجودة"
        description="الرابط الذي اتبعته قد يكون غير صحيح أو تم نقل الصفحة."
        action={
          <Link href="/" variant="secondary">
            العودة للرئيسية
          </Link>
        }
      />
    </PageContainer>
  );
}
