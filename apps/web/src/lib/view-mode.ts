"use client";

import { useEffect, useState } from "react";

// Modo de vista consumer: "social" (nightlife: eventos, QR, bailes) vs
// "academy" (Mi Aprendizaje: clases, prácticas, particulares). Es
// ortogonal al rol activo — solo aplica a la lente DANCER; los roles de
// gestión tienen su dominio fijo. Persiste por dispositivo y emite un
// evento para re-render sin recarga (mismo patrón que active-role).
export type ViewMode = "social" | "academy";

export const VIEW_MODE_EVENT = "omnidance:view-mode";
const STORAGE_KEY = "omnidance:view-mode";

export function getViewMode(): ViewMode {
  if (typeof window === "undefined") return "social";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "academy"
      ? "academy"
      : "social";
  } catch {
    return "social";
  }
}

export function setViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Sin storage — el evento igual actualiza esta pestaña.
  }
  window.dispatchEvent(new Event(VIEW_MODE_EVENT));
}

export function useViewMode(): ViewMode {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(VIEW_MODE_EVENT, onChange);
    return () => window.removeEventListener(VIEW_MODE_EVENT, onChange);
  }, []);
  return getViewMode();
}
