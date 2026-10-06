import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import landingParts from "@/i18n/parts/landing.json";
import { fetchPublicEvents, thisWeek } from "@/lib/public-events";

const t = landingParts.landingProducer;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/para-productores" },
  openGraph: {
    title: t.metaTitle,
    description: t.metaDescription,
    url: "/para-productores",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

// Landing de audiencia PRODUCER: ticketing, puerta QR y números.
export default async function ProducerLanding() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
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
