import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import landingParts from "@/i18n/parts/landing.json";
import { countThisWeek, fetchPublicEvents } from "@/lib/public-events";

const t = landingParts.landingPro;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/pro" },
  openGraph: {
    title: `${t.metaTitle} — Omnidance`,
    description: t.metaDescription,
    url: "/pro",
  },
};

// Misma landing, audiencia PRO: productores, academias y venues.
export default async function ProLanding() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
  const events = await fetchPublicEvents();
  return (
    <>
      <JsonLd events={events.slice(0, 3)} />
      <Landing variant="pro" weeklyEvents={countThisWeek(events)} />
    </>
  );
}
