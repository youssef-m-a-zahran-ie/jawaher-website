import type { Metadata } from "next";
import { Almarai } from "next/font/google";

import { Footer } from "@/ui/footer";
import { Header } from "@/ui/header";
import { ToastProvider } from "@/ui/primitives/toast";

import "./globals.css";

// Official brand typeface — docs/design/design-system.md §3. Weights match
// the four specified in the brand guideline PDF (Light/Regular/Bold/Extra Bold).
const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
});

export const metadata: Metadata = {
  title: "جواهر الخير",
  description: "جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${almarai.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-surface font-sans text-text-primary antialiased">
        <ToastProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
