"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type AcademyCap =
  | "students"
  | "payments"
  | "plans"
  | "schedule"
  | "profile"
  | "team"
  | "billing";

// GET /academies/:id/access - qué ve el viewer en la consola de esta
// academia (spec academy-staff-roles). Owner/ADMIN reportan caps all-true.
export type AcademyAccessInfo = {
  isOwner: boolean;
  isAdmin: boolean;
  isInstructor: boolean;
  isStaff: boolean;
  caps: Record<AcademyCap, boolean>;
};

/**
 * Resuelve el acceso del viewer a una academia. `null` mientras carga o si
 * la llamada falla (la consola igual muestra los módulos operativos - el
 * backend sigue siendo la autoridad en cada endpoint).
 */
export function useAcademyAccess(academyId: string) {
  const [access, setAccess] = useState<AcademyAccessInfo | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch(`/academies/${academyId}/access`)
      .then(async (res) => {
        if (!alive) return;
        setAccess(res.ok ? await res.json() : null);
      })
      .catch(() => {
        if (alive) setAccess(null);
      });
    return () => {
      alive = false;
    };
  }, [academyId]);

  return access;
}
