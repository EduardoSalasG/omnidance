"use client";

import { useSyncExternalStore } from "react";

// Modo de inicio de la consola de academia (spec
// academies/owner-insights): "simple" = 3-4 cards accionables en
// lenguaje llano (default), "extended" = las cards analíticas
// completas + niveles y cupos. Persiste por dispositivo y emite un
// evento para re-render sin recarga (mismo patrón que view-mode.ts).
export type AcademyHomeMode = "simple" | "extended";

const HOME_MODE_EVENT = "omnidance:academy-home-mode";
const STORAGE_KEY = "omnidance:academy-home-mode";

function getAcademyHomeMode(): AcademyHomeMode {
  if (typeof window === "undefined") return "simple";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "extended"
      ? "extended"
      : "simple";
  } catch {
    return "simple";
  }
}

export function setAcademyHomeMode(mode: AcademyHomeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Sin storage: el evento igual actualiza esta pestaña.
  }
  window.dispatchEvent(new Event(HOME_MODE_EVENT));
}

// useSyncExternalStore: el snapshot de servidor es "simple"; si el
// cliente tiene "extended" guardado, React re-renderiza post-mount sin
// error de hidratación (mismo patrón que view-mode.ts).
function subscribeHomeMode(onChange: () => void): () => void {
  window.addEventListener(HOME_MODE_EVENT, onChange);
  return () => window.removeEventListener(HOME_MODE_EVENT, onChange);
}

export function useAcademyHomeMode(): AcademyHomeMode {
  return useSyncExternalStore(subscribeHomeMode, getAcademyHomeMode, () => "simple");
}
