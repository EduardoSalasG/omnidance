import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { SITE_URL } from "@/lib/site-url";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { fetchPublicEvents, thisWeek } from "@/lib/public-events";
import { redirect } from "@/i18n/navigation";



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
    // El openGraph propio de la página tapa la convención
    // opengraph-image.tsx - la imagen se declara explícita (la spec
    // OG exige URL absoluta: los crawlers no resuelven relativas).
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};
}

// La decisión anónimo/logueado ocurre en el servidor - la landing llega
// como HTML real (LCP, SEO) y quien tiene sesión va directo al hub.
export default async function Home() {
  const locale = await getLocale();
  if ((await cookies()).has("omnidance_session")) redirect({ href: "/inicio", locale });
  const events = await fetchPublicEvents();
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
