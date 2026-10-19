"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

// Mismo basemap que EventsMapInner: CARTO Voyager con key, OSM sin key.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY;
const TILES_ATTR = CARTO_KEY
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const OSM_STD = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Pin SVG inline (divIcon - sin assets de Leaflet) en el acento activo.
function pinIcon(accent: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${accent};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Mapa con pin arrastrable para fijar lat/lng (spec academy-approval-gate):
 * centro = coordenadas actuales; dragend reporta la nueva posición.
 */
export default function AddressMapInner({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const [accent, setAccent] = useState("#a3e635");
  useEffect(() => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    if (raw) setAccent(`rgb(${raw})`);
  }, []);

  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      className="h-full w-full"
      scrollWheelZoom
    >
      {CARTO_KEY ? (
        <TileLayer
          url={`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`}
          attribution={TILES_ATTR}
          subdomains="abcd"
          maxZoom={20}
        />
      ) : (
        <TileLayer url={OSM_STD} attribution={TILES_ATTR} maxZoom={19} />
      )}
      <Marker
        position={[lat, lng]}
        icon={pinIcon(accent)}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onChange(p.lat, p.lng);
          },
        }}
      />
    </MapContainer>
  );
}
