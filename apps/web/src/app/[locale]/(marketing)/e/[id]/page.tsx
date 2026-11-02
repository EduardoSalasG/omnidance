import { cache } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { serverApiUrl } from "@/lib/server-api";
import { getDateFmt } from "@/lib/intl";
import type { Locale } from "@/i18n/routing";
import { localeAlternates } from "@/lib/seo";
import { EventDetailContent } from "@/app/[locale]/(app)/eventos/[id]/event-detail-content";

type PublicEvent = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  venueText: string | null;
  venue: { name: string; address: string | null } | null;
};

// cache() deduplica el fetch entre generateMetadata y la ficha
// (EventoDetailPage hace el suyo propio; esto solo alimenta el meta).
const getEvent = cache(async (id: string): Promise<PublicEvent | null> => {
  const API_URL = await serverApiUrl();
  const res = await fetch(`${API_URL}/api/events/${encodeURIComponent(id)}`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as PublicEvent;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("eventLanding");
  const locale = (await getLocale()) as Locale;
  const event = await getEvent(id);
  if (!event || event.status === "DRAFT") {
    return { title: t("unavailableTitle") };
  }
  const venueName = event.venue?.name ?? event.venueText;
  const date = getDateFmt(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(event.startsAt));
  return {
    // El template del root layout agrega " | Omnidance".
    title: event.name,
    description: venueName
      ? t("metaDescription", { name: event.name, date, venue: venueName })
      : t("metaDescriptionNoVenue", { name: event.name, date }),
    alternates: localeAlternates(locale, `/e/${id}`),
  };
}

/**
 * Landing pública de captación del evento (spec public-event-landing):
 * el link lo comparte el productor por redes/WhatsApp. Renderiza la
 * ficha completa de /eventos/[id] en modo anónimo (misma superficie,
 * mismos datos públicos): los islands de cuenta quedan ocultos (Mi
 * viaje, pase de serie) y los datos session-gated ya degradan a null
 * server-side. El CTA de compra navega a /eventos/:id/checkout que
 * es ruta protegida: el middleware rebota a /login?next=<checkout> y
 * post-login continúa el flujo estándar, exactamente como el usuario
 * pidió (login → link normal).
 */
export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EventDetailContent params={params} anonymous />;
}
