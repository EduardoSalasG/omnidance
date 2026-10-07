"use client";

import { useEffect, useSyncExternalStore } from "react";

// Preferencia de tema: "system" sigue prefers-color-scheme del equipo,
// "light"/"dark" la sobreescriben. Persiste en localStorage por
// dispositivo y emite evento para re-render sin recarga (mismo patrón
// que sidebar-state). La clase .light/.dark en <html> la aplica el
// script inline del root layout antes del primer paint (sin FOUC);
// este módulo la mantiene sincronizada después.
export type ThemePref = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_EVENT = "omnidance:theme";
const STORAGE_KEY = "omnidance:theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function getThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref !== "system") return pref;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.classList.toggle("light", resolved === "light");
  el.dataset.theme = resolved;
}

export function setThemePref(pref: ThemePref): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Sin storage - el evento igual actualiza esta pestaña.
  }
  applyTheme(resolveTheme(pref));
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Estado del tema en vivo: re-render ante (a) cambio de preferencia por
// el usuario, (b) cambio del SO cuando pref=system. useSyncExternalStore
// evita el efecto de suscripción manual y el mismatch SSR→cliente: el
// snapshot de servidor es "system" y se reconcilia tras mount (la clase
// real ya la puso el script inline, así que no hay flash).
function subscribe(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  const media = window.matchMedia(DARK_QUERY);
  const onMedia = () => {
    if (getThemePref() === "system") {
      applyTheme(resolveTheme("system"));
      onChange();
    }
  };
  media.addEventListener("change", onMedia);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    media.removeEventListener("change", onMedia);
  };
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore<ThemePref>(subscribe, getThemePref, () => "system");
}

export function useResolvedTheme(): ResolvedTheme {
  const pref = useThemePref();
  // matchMedia solo existe en cliente; en SSR el script inline ya dejó
  // la clase correcta, así que el valor de aquí solo alimenta íconos.
  const resolved = useSyncExternalStore<ResolvedTheme>(
    subscribe,
    () => resolveTheme(getThemePref()),
    () => "dark",
  );
  return pref === "system" ? resolved : pref;
}
