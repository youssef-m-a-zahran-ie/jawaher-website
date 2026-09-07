"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { Label } from "@/ui/primitives/label";
import { Textarea } from "@/ui/primitives/textarea";
import { useToast } from "@/ui/primitives/toast";

/** Posts to /api/v1/contact (src/app/api/v1/contact/route.ts) — a real, working endpoint; see its own comment for what "working" means today. */
export function ContactForm() {
  const { show } = useToast();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSubmitting(true);

    try {
      const response = await fetch("/api/v1/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.get("name"),
          contact: formData.get("contact"),
          message: formData.get("message"),
        }),
      });
      const result = await response.json();

      if (response.ok && result.data?.received) {
        show({ title: "تم استلام رسالتك", description: "سنتواصل معك في أقرب وقت.", variant: "success" });
        form.reset();
      } else {
        show({
          title: "تعذّر إرسال الرسالة",
          description: result.error?.message_ar ?? "برجاء المحاولة مرة أخرى.",
          variant: "danger",
        });
      }
    } catch {
      show({ title: "تعذّر إرسال الرسالة", description: "تحقق من الاتصال وحاول مرة أخرى.", variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-md flex-col gap-4">
      <div>
        <Label htmlFor="name" required>
          الاسم
        </Label>
        <Input id="name" name="name" required maxLength={120} className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="contact" required>
          رقم الهاتف أو البريد الإلكتروني
        </Label>
        <Input id="contact" name="contact" required maxLength={200} className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="message" required>
          الرسالة
        </Label>
        <Textarea id="message" name="message" required minLength={10} maxLength={2000} className="mt-1.5" />
      </div>
      <Button type="submit" loading={submitting} fullWidth>
        إرسال
      </Button>
    </form>
  );
}
