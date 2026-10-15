import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { fetchPublicEvents, thisWeek } from "@/lib/public-events";
import { redirect } from "@/i18n/navigation";



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
export default async function ProducerLanding() {
  const locale = await getLocale();
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.landingProducer;
  if ((await cookies()).has("omnidance_session")) redirect({ href: "/inicio", locale });
  const events = await fetchPublicEvents();
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
