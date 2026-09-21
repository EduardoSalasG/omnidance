import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import landingParts from "@/i18n/parts/landing.json";
import { fetchPublicEvents, thisWeek } from "@/lib/public-events";

const t = landingParts.landingPro;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/pro" },
  openGraph: {
    title: `${t.metaTitle} — Omnidance`,
    description: t.metaDescription,
    url: "/pro",
    // El openGraph propio de la página tapa la convención
    // opengraph-image.tsx — la imagen se declara explícita.
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

// Misma landing, audiencia PRO: productores, academias y venues.
export default async function ProLanding() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
  const events = await fetchPublicEvents();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing
        variant="pro"
        weeklyEvents={thisWeek(events).length}
        weekEvents={thisWeek(events).slice(0, 3)}
      />
    </>
  );
}
