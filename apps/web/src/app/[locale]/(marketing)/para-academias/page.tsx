import type { Metadata } from "next";

import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import { getMessages, getLocale } from "next-intl/server";
import { localeAlternates } from "@/lib/seo";
import { type Locale } from "@/i18n/routing";
import { marketingEvents, marketingAcademies } from "@/lib/marketing-content";



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
// Data del catálogo commiteado - cero requests al API (spec
// marketing-content); el revalidate solo recalcula el render.
export const revalidate = 3600;

export default async function AcademyLanding() {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  const t = m.landingAcademy;
  // Logueado → /inicio lo decide el middleware (página estática).
  const events = marketingEvents();
  const academies = marketingAcademies();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing variant="academy" academies={academies} />
    </>
  );
}
