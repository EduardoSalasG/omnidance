import { notFound } from "next/navigation";
import { serverApiUrl } from "@/lib/server-api";
import { PaseClient } from "./pase-client";

// Pase Social (spec pase-social): pitch público + panel del miembro.
// Vive en (marketing) como /pro: el pitch se ve anónimo y el flag
// `social_pass` se resuelve server-side contra el mapa público de
// GET /features - OFF → 404 (fail-closed, mismo criterio que
// /ciudades).

export const dynamic = "force-dynamic";

async function flagOn(): Promise<boolean> {
  try {
    const res = await fetch(`${await serverApiUrl()}/api/features`, {
      cache: "no-store",
    });
    if (!res.ok) return false;
    const flags = (await res.json()) as Record<string, boolean>;
    return flags.social_pass === true;
  } catch {
    return false;
  }
}

export default async function PasePage() {
  if (!(await flagOn())) notFound();
  return <PaseClient />;
}
