import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { marketingEvents, thisWeek } from "@/lib/marketing-content";



export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  return {  title: m.landingProducer.metaTitle,
  description: m.landingProducer.metaDescription,
  alternates: localeAlternates(locale, "/para-productores"),
  openGraph: {
    title: m.landingProducer.metaTitle,
    description: m.landingProducer.metaDescription,
    url: "/para-productores",
  },
};
}

// Landing de audiencia PRODUCER: ticketing, puerta QR y números.
// Data del catálogo commiteado - cero requests al API (spec
// marketing-content); el revalidate solo recalcula "esta semana".
export const revalidate = 3600;

export default async function ProducerLanding() {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.landingProducer;
  // Logueado → /inicio lo decide el middleware (página estática).
  const events = marketingEvents();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing
        variant="producer"
        weeklyEvents={thisWeek(events).length}
        weekEvents={thisWeek(events).slice(0, 3)}
      />
    </>
  );
}
