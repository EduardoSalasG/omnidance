"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { MapVenue } from "./EventsMap";

const TILES_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILES_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * Mapa dark-first de locales con eventos. Pins circulares SVG (sin
 * assets de Leaflet) en el color de acento activo; tap → perfil del
 * local en /locales/:id.
 */
export default function EventsMapInner({ venues }: { venues: MapVenue[] }) {
  const router = useRouter();
  // El acento es CSS var (swappea Social/Academia) — se lee una vez.
  const [accent, setAccent] = useState("#a3e635");
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    if (raw) setAccent(`rgb(${raw})`);
  }, []);

  const bounds = venues.map((v) => [v.lat, v.lng] as [number, number]);

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [48, 48] }}
      className="h-full w-full"
      scrollWheelZoom
    >
      <TileLayer url={TILES_URL} attribution={TILES_ATTR} />
      {venues.map((v) => (
        <CircleMarker
          key={v.id}
          center={[v.lat, v.lng]}
          radius={9}
          pathOptions={{
            color: "#0a0a0f",
            weight: 2,
            fillColor: accent,
            fillOpacity: 1,
          }}
          eventHandlers={{
            click: () => router.push(`/locales/${v.id}`),
          }}
        >
          <Tooltip
            permanent
            direction="top"
            offset={[0, -10]}
            className="venue-map-label"
          >
            {v.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
