"use client";

import { useEffect } from "react";

// Clave sessionStorage por evento (spec academy-presale-commission): el
// link de la academia llega como /eventos/[id]?a=<academyId>. Se persiste
// acá y el checkout del mismo evento lo adjunta como academyId - la
// atribución no cruza eventos ni pestañas (sessionStorage muere con la
// pestaña, alcance deseado).
export const academyAttrKey = (eventId: string) =>
  `omni.academyAttr.${eventId}`;

/**
 * Persiste la atribución ?a=<academyId> de la landing del evento. No
 * renderiza nada - montar en la página de detalle; el checkout lo lee.
 */
export function AcademyAttribution({
  eventId,
  academyId,
}: {
  eventId: string;
  academyId: string | null;
}) {
  useEffect(() => {
    if (!academyId) return;
    try {
      sessionStorage.setItem(academyAttrKey(eventId), academyId);
    } catch {
      // Storage lleno/bloqueado (modo privado iOS antiguo): la compra
      // sigue igual - la atribución simplemente no viaja.
    }
  }, [eventId, academyId]);
  return null;
}
