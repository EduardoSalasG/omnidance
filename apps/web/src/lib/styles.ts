// Helpers server-side para las landings SEO de estilos (/estilos/*).
// Mismo patrón que (marketing)/page.tsx: API_URL es env server-only —
// el browser nunca la ve (sin NEXT_PUBLIC_).
const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type StyleCatalogItem = {
  id: string;
  name: string;
  genre: "SALSA" | "BACHATA" | "CUBANO" | "OTHER";
};

export type StyleLanding = {
  style: StyleCatalogItem & { parentId: string | null; slug: string };
  academies: { id: string; name: string }[];
  upcomingClasses: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    seriesName: string | null;
    levelName: string | null;
    academyName: string;
  }[];
  upcomingEvents: {
    id: string;
    name: string;
    type: string;
    startsAt: string;
    endsAt: string;
    series: { name: string } | null;
    venue: { name: string; address: string | null } | null;
  }[];
};

/**
 * Slug de URL del estilo ("Salsa cubana (casino)" → "salsa-cubana-casino").
 * Debe calzar con slugify() de styles.controller.ts (mismo algoritmo).
 */
export function styleSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const GENRE_LABEL: Record<StyleCatalogItem["genre"], string> = {
  SALSA: "Salsa",
  BACHATA: "Bachata",
  CUBANO: "Cubano",
  OTHER: "Fusión",
};

// Fallo silencioso: si la API está abajo las páginas deciden (404 o
// grilla vacía) — el fetch nunca tumba el render.
export async function fetchStyles(): Promise<StyleCatalogItem[]> {
  try {
    const res = await fetch(`${API_URL}/api/styles`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as StyleCatalogItem[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchStyleLanding(
  idOrSlug: string,
): Promise<StyleLanding | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/styles/${encodeURIComponent(idOrSlug)}/landing`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as StyleLanding;
  } catch {
    return null;
  }
}
