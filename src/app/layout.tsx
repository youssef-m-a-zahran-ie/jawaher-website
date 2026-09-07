import type { Metadata } from "next";
import { Almarai } from "next/font/google";

import { SITE_URL } from "@/lib/site-url";
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { Footer } from "@/ui/footer";
import { Header } from "@/ui/header";
import { ToastProvider } from "@/ui/primitives/toast";
import { JsonLd } from "@/ui/structured-data";

import "./globals.css";

// Official brand typeface — docs/design/design-system.md §3. Weights match
// the four specified in the brand guideline PDF (Light/Regular/Bold/Extra Bold).
const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["arabic"],
  weight: ["300", "400", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "جواهر الخير — تُمُور وأكثر", template: "%s | جواهر الخير" },
  description: "جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
  openGraph: {
    type: "website",
    locale: "ar_EG",
    siteName: "جواهر الخير",
    title: "جواهر الخير — تُمُور وأكثر",
    description: "جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
  },
  twitter: {
    card: "summary_large_image",
    title: "جواهر الخير — تُمُور وأكثر",
    description: "جواهر الخير — تمور، عسل، زيوت، مكسرات وسمن.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${almarai.variable} h-full`}>
      <body className="flex min-h-full flex-col bg-surface font-sans text-text-primary antialiased">
        <JsonLd data={organizationJsonLd()} />
        <JsonLd data={websiteJsonLd()} />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-cta-bg focus:px-4 focus:py-2 focus:text-cta-text"
        >
          تخطي إلى المحتوى
        </a>
        <ToastProvider>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </ToastProvider>
      </body>
    </html>
  );
}
