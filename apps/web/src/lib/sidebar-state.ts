"use client";

import { useSyncExternalStore } from "react";

// Estado de la sidebar desktop (AppSidebar): "expanded" (ícono + label)
// vs "collapsed" (solo íconos, ancho mínimo). Solo aplica a ≥lg - el
// chrome móvil sigue con BottomNav/SideDrawer. Persiste por dispositivo
// y emite un evento para re-render sin recarga (mismo patrón que
// view-mode y active-role).
type SidebarState = "expanded" | "collapsed";

const SIDEBAR_STATE_EVENT = "omnidance:sidebar";
const STORAGE_KEY = "omnidance:sidebar";

function getSidebarState(): SidebarState {
  if (typeof window === "undefined") return "expanded";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "collapsed"
      ? "collapsed"
      : "expanded";
  } catch {
    return "expanded";
  }
}

export function setSidebarState(state: SidebarState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // Sin storage - el evento igual actualiza esta pestaña.
  }
  window.dispatchEvent(new Event(SIDEBAR_STATE_EVENT));
}

// useSyncExternalStore: snapshot de servidor "expanded" - si el cliente
// tiene "collapsed" guardado re-renderiza post-mount sin error de
// hidratación (ver view-mode.ts / active-role.ts).
function subscribeSidebar(onChange: () => void): () => void {
  window.addEventListener(SIDEBAR_STATE_EVENT, onChange);
  return () => window.removeEventListener(SIDEBAR_STATE_EVENT, onChange);
}

export function useSidebarState(): SidebarState {
  return useSyncExternalStore(
    subscribeSidebar,
    getSidebarState,
    () => "expanded",
  );
}
