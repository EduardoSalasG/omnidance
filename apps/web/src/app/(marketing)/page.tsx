import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd } from "@/components/landing/JsonLd";
import landingParts from "@/i18n/parts/landing.json";
import { fetchPublicEvents, thisWeek } from "@/lib/public-events";

const t = landingParts.landing;

export const metadata: Metadata = {
  title: t.metaTitle,
  description: t.metaDescription,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${t.metaTitle} — Omnidance`,
    description: t.metaDescription,
    url: "/",
    // El openGraph propio de la página tapa la convención
    // opengraph-image.tsx — la imagen se declara explícita.
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
};

// La decisión anónimo/logueado ocurre en el servidor — la landing llega
// como HTML real (LCP, SEO) y quien tiene sesión va directo al hub.
export default async function Home() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
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
