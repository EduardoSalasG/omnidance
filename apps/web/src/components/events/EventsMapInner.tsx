"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { MapVenue } from "./EventsMap";

// Basemap dark: CARTO Dark Matter con key (NEXT_PUBLIC_CARTO_BASEMAP_KEY —
// gratis hasta ~5M tiles/mes, pedir en carto.com/basemaps/apikey). Sin key
// cae a Esri Dark Gray, gratuito sin registro — nunca se sirven tiles con
// el watermark "API key required".
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
const TILES_ATTR = CARTO_KEY
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ";
const ESRI_BASE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

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
      {CARTO_KEY ? (
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`}
          attribution={TILES_ATTR}
          subdomains="abcd"
          maxZoom={20}
        />
      ) : (
        <>
          <TileLayer url={ESRI_BASE} attribution={TILES_ATTR} />
          <TileLayer url={ESRI_LABELS} />
        </>
      )}
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
