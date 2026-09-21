"use client";

import dynamic from "next/dynamic";

export type MapVenue = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  eventCount: number;
};

// Leaflet es client-only (toca window en import) — carga diferida con
// skeleton mientras baja el chunk. La altura la da el contenedor padre.
const Inner = dynamic(() => import("./EventsMapInner"), {
  ssr: false,
  loading: () => (
    <div className="page-loading flex h-full w-full items-center justify-center rounded-2xl border border-night-700 bg-night-900 text-sm text-white/50">
      Cargando mapa…
    </div>
  ),
});

export default function EventsMap({ venues }: { venues: MapVenue[] }) {
  return <Inner venues={venues} />;
}
