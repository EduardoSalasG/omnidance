import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { SITE_URL } from "@/lib/site-url";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { fetchPublicEvents } from "@/lib/public-events";
import { fetchPublicAcademies } from "@/lib/public-academies";
import { redirect } from "@/i18n/navigation";



export async function generateMetadata(): Promise<Metadata> {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const locale = (await getLocale()) as Locale;
  return {  title: m.landingAcademy.metaTitle,
  description: m.landingAcademy.metaDescription,
  alternates: localeAlternates(locale, "/para-academias"),
  openGraph: {
    title: m.landingAcademy.metaTitle,
    description: m.landingAcademy.metaDescription,
    url: "/para-academias",
    images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630 }],
  },
};
}

// Landing de audiencia ACADEMY_OWNER: copy y acento del modo Academy.
export default async function AcademyLanding() {
  const locale = await getLocale();
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.landingAcademy;
  if ((await cookies()).has("omnidance_session")) redirect({ href: "/inicio", locale });
  const [events, academies] = await Promise.all([
    fetchPublicEvents(),
    fetchPublicAcademies(),
  ]);
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing variant="academy" academies={academies} />
    </>
  );
}
