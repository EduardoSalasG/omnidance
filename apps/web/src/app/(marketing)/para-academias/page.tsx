import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import landingParts from "@/i18n/parts/landing.json";
import { fetchPublicEvents } from "@/lib/public-events";
import { fetchPublicAcademies } from "@/lib/public-academies";

const t = landingParts.landingAcademy;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/para-academias" },
  openGraph: {
    title: t.metaTitle,
    description: t.metaDescription,
    url: "/para-academias",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

// Landing de audiencia ACADEMY_OWNER: copy y acento del modo Academy.
export default async function AcademyLanding() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
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
