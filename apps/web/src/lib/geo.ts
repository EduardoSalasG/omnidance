// Distancia haversine en km entre dos coordenadas (para "cerca de ti").
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// "1,2 km" / "850 m" — corto para la línea meta del card.
export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
  return `${km.toLocaleString("es-CL", { maximumFractionDigits: 1 })} km`;
}

// Parsea "lat,lng" del query param ?near= — null si es inválido.
export function parseNear(raw: string | undefined): { lat: number; lng: number } | null {
  if (!raw) return null;
  const [lat, lng] = raw.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}
