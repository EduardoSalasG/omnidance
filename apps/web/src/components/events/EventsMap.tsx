"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

export type MapVenue = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  eventCount: number;
  /** Destino del pin - default /locales/:id; /academias lo usa con
      /academias/:id. */
  href?: string;
};

// Leaflet es client-only (toca window en import) - carga diferida con
// skeleton de bloque mientras baja el chunk (layout conocido: un
// rectángulo de altura completa, sin texto). La altura la da el
// contenedor padre, que ya aporta borde y radio.
const Inner = dynamic(() => import("./EventsMapInner"), {
  ssr: false,
  loading: () => <Skeleton className="page-loading h-full w-full" />,
});

export default function EventsMap({ venues }: { venues: MapVenue[] }) {
  return <Inner venues={venues} />;
}
