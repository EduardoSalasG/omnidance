import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { marketingEvents, thisWeek } from "@/lib/marketing-content";



export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as {
    landing: Record<string, string>;
  };
  const locale = (await getLocale()) as Locale;
  return {  title: m.landing.metaTitle,
  description: m.landing.metaDescription,
  alternates: localeAlternates(locale, "/"),
  openGraph: {
    title: `${m.landing.metaTitle} | Omnidance`,
    description: m.landing.metaDescription,
    url: "/",
    // og:image lo aporta la convención [locale]/opengraph-image.tsx
    // (por locale, resuelta contra metadataBase del layout).
  },
};
}

// La decisión anónimo/logueado ocurre en el middleware (cookie presente
// → /inicio) - la página queda estática/cacheable y la landing llega
// como HTML real (LCP, SEO, bfcache). La data sale del catálogo
// commiteado (spec marketing-content): cero requests al API; el
// revalidate solo re-ejecuta el render para recalcular "esta semana".
export const revalidate = 3600;

export default async function Home() {
  const events = marketingEvents();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing
        weeklyEvents={thisWeek(events).length}
        weekEvents={thisWeek(events).slice(0, 3)}
      />
    </>
  );
}
