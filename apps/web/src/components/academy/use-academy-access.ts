"use client";

import { useCallback, useEffect, useState } from "react";
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

export type AcademyAccessState = "loading" | "ready" | "error";

// Fetch compartido: el estado "error" queda explícito (antes el fallo
// colapsaba a access=null y el caller no podía distinguirlo de
// "cargando" - la grilla del hub quedaba oculta sin aviso ni retry).
function useAccessFetch(academyId: string): {
  access: AcademyAccessInfo | null;
  state: AcademyAccessState;
  reload: () => void;
} {
  const [access, setAccess] = useState<AcademyAccessInfo | null>(null);
  const [state, setState] = useState<AcademyAccessState>("loading");

  const reload = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academyId}/access`);
      if (res.ok) {
        setAccess((await res.json()) as AcademyAccessInfo);
        setState("ready");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }, [academyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { access, state, reload: () => void reload() };
}

/**
 * Resuelve el acceso del viewer a una academia. `null` mientras carga o
 * si la llamada falla (la consola igual muestra los módulos operativos -
 * el backend sigue siendo la autoridad en cada endpoint). Compat con los
 * callers que solo necesitan el access; para distinguir error de carga
 * usar `useAcademyAccessState`.
 */
export function useAcademyAccess(academyId: string) {
  return useAccessFetch(academyId).access;
}

/**
 * Variante con estado completo del fetch: `state` distingue loading /
 * ready / error y `reload` reintenta la llamada (para error + retry en
 * superficies que sí lo muestran, p.ej. la grilla del hub /academia).
 */
export function useAcademyAccessState(academyId: string) {
  return useAccessFetch(academyId);
}
