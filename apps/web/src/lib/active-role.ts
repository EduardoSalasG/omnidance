"use client";

import { useEffect, useState } from "react";

// Rol activo = la "lente" con que la persona usa la app en este dispositivo.
// Quien tiene varios roles (p.ej. PRODUCER + DANCER) elige la lente desde
// Perfil; el resto de la UI (BottomNav, HomeHub) la resuelve desde aquí.
export type AppRole =
  | "DANCER"
  | "STAFF"
  | "PRODUCER"
  | "ACADEMY_OWNER"
  | "INSTRUCTOR"
  | "DJ"
  | "VENUE_MANAGER"
  | "SUPPORT"
  | "ADMIN";

// Evento de ventana emitido por setActiveRole: los hooks lo escuchan para
// re-resolver la lente sin recargar la página.
export const ACTIVE_ROLE_EVENT = "omnidance:active-role";

const STORAGE_KEY = "omnidance:active-role";

// De mayor a menor privilegio: sin elección guardada se asume la lente más
// "gestora" que tenga la persona (un ADMIN que nunca eligió entra como admin).
const ROLE_PRIORITY: AppRole[] = [
  "ADMIN",
  "SUPPORT",
  "PRODUCER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
  "VENUE_MANAGER",
  "STAFF",
  "DJ",
  "DANCER",
];

const APP_ROLES = new Set<string>(ROLE_PRIORITY);

export function getStoredActiveRole(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw != null && APP_ROLES.has(raw) ? (raw as AppRole) : null;
  } catch {
    // Storage bloqueado/lleno → sin lente persistida.
    return null;
  }
}

export function resolveActiveRole(roles: string[]): AppRole {
  const stored = getStoredActiveRole();
  // DANCER es la lente consumidora: siempre válida aunque /me no liste el
  // rol explícito (toda persona puede mirar la app como bailarín).
  if (stored === "DANCER") return "DANCER";
  if (stored && roles.includes(stored)) return stored;
  for (const role of ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  return "DANCER";
}

export function setActiveRole(role: AppRole): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // Si persiste o no, igual avisamos a los listeners de esta pestaña.
  }
  window.dispatchEvent(new Event(ACTIVE_ROLE_EVENT));
}

/**
 * Rol activo reactivo: re-resuelve ante el evento ACTIVE_ROLE_EVENT.
 * Antes de conocer los roles (fetch /me pendiente o sin sesión) devuelve
 * resolveActiveRole(roles ?? []).
 */
export function useActiveRole(roles: string[] | undefined | null): AppRole {
  // El estado solo fuerza un nuevo resolve cuando otro componente cambia
  // la lente vía setActiveRole (el valor real se lee en cada render).
  const [, setVersion] = useState(0);
  useEffect(() => {
    const onRoleChange = () => setVersion((v) => v + 1);
    window.addEventListener(ACTIVE_ROLE_EVENT, onRoleChange);
    return () => window.removeEventListener(ACTIVE_ROLE_EVENT, onRoleChange);
  }, []);
  return resolveActiveRole(roles ?? []);
}
