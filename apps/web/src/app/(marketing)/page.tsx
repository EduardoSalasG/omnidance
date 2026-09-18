import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Landing } from "@/components/landing/Landing";
import { JsonLd, type JsonLdEvent } from "@/components/landing/JsonLd";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export const metadata: Metadata = {
  title: "Salsa, bachata y cubano en Santiago",
  alternates: { canonical: "/" },
};

// Eventos publicados para el ItemList de DanceEvent del JSON-LD — la
// landing ya no los muestra ("menos es más"), pero el schema sigue
// aportando rich results. Fallo silencioso: la página no depende de esto.
async function fetchPublicEvents(): Promise<JsonLdEvent[]> {
  try {
    const res = await fetch(`${API_URL}/api/events`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as JsonLdEvent[];
    return Array.isArray(data) ? data.slice(0, 3) : [];
  } catch {
    return [];
  }
}

// La decisión anónimo/logueado ocurre en el servidor — la landing llega
// como HTML real (LCP, SEO) y quien tiene sesión va directo al hub.
export default async function Home() {
  if (cookies().has("omnidance_session")) redirect("/inicio");
  const events = await fetchPublicEvents();
  return (
    <>
      <JsonLd events={events} />
      <Landing />
    </>
  );
}
