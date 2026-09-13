import { UserRound } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/ui/primitives/empty-state";
import { Link } from "@/ui/primitives/link";
import { PageContainer } from "@/ui/primitives/page-container";

export const metadata: Metadata = { title: "الحساب" };

/**
 * A minimal, honest placeholder — Login/OTP/Account (requirements §10) is
 * SHOULD-have, not MUST, and no auth backend exists yet (this phase's
 * brief explicitly excludes customer accounts). Exists so the header/
 * mobile-drawer account entry point (docs/ux/ux-specification.md §3's
 * "account/login entry") doesn't 404 rather than because this phase
 * builds accounts.
 *
 * Phase 9.7: points to /track — a guest with no account can still find an
 * order's status without logging in, so this dead-end at least offers the
 * one real thing available today, instead of only "continue shopping".
 */
export default function AccountPage() {
  return (
    <PageContainer className="py-10">
      <EmptyState
        icon={<UserRound className="size-10" />}
        title="تسجيل الدخول والحساب الشخصي"
        description="هذه الميزة قيد التطوير وستتوفر قريبًا. لمعرفة حالة طلب سابق، استخدم تتبع الطلب."
        action={
          <div className="flex gap-3">
            <Link href="/track" variant="primary">
              تتبع الطلب
            </Link>
            <Link href="/shop" variant="secondary">
              متابعة التسوق
            </Link>
          </div>
        }
      />
    </PageContainer>
  );
}
