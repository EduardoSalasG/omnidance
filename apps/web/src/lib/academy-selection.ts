import { useSyncExternalStore } from "react";

// Academia seleccionada en la consola (AcademyGate, switcher de la
// nav, /academia/nueva): persiste en localStorage y los cambios se
// propagan por CustomEvent dentro de la pestaña (el evento nativo
// "storage" cubre otras pestañas). Vive en lib/ porque lo consumen
// componentes y contexts por igual; components/academy/shared.ts lo
// re-exporta por compatibilidad.
export const ACADEMY_STORAGE_KEY = "omnidance:academy-id";
export const ACADEMY_CHANGED_EVENT = "omnidance:academy-changed";

/** Lee la selección persistida (null sin storage o sin valor). */
export function readStoredAcademyId(): string | null {
  try {
    return window.localStorage.getItem(ACADEMY_STORAGE_KEY);
  } catch {
    // Sin storage (modo privado) - se usa la primera academia.
    return null;
  }
}

/**
 * Persiste la selección y la propaga a los listeners de la pestaña
 * (gate, entitlements, CRM, otras instancias del switcher). El gate
 * y las páginas refetchean su data sin recarga.
 */
export function selectStoredAcademy(id: string): void {
  try {
    window.localStorage.setItem(ACADEMY_STORAGE_KEY, id);
  } catch {
    // Sin storage - la selección vive solo en memoria.
  }
  window.dispatchEvent(
    new CustomEvent(ACADEMY_CHANGED_EVENT, { detail: { id } }),
  );
}

function subscribeAcademySelection(onChange: () => void): () => void {
  window.addEventListener(ACADEMY_CHANGED_EVENT, onChange);
  // La key también puede cambiar desde otra pestaña del mismo origen.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(ACADEMY_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Selección persistida reactiva: re-render del consumidor cuando el
 * switcher, el gate u otra pestaña cambian la academia. Equivale a
 * leer localStorage en cada render pero suscrito a los cambios.
 */
export function useStoredAcademyId(): string | null {
  return useSyncExternalStore(
    subscribeAcademySelection,
    readStoredAcademyId,
    () => null,
  );
}
