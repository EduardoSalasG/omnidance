import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { fetchPublicEvents } from "@/lib/public-events";
import { fetchPublicAcademies } from "@/lib/public-academies";



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
  },
};
}

// Landing de audiencia ACADEMY_OWNER: copy y acento del modo Academy.
export default async function AcademyLanding() {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.landingAcademy;
  // Logueado → /inicio lo decide el middleware (página estática).
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
