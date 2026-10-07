"use client";

import { useEffect, useState } from "react";

// Estado de la sidebar desktop (AppSidebar): "expanded" (ícono + label)
// vs "collapsed" (solo íconos, ancho mínimo). Solo aplica a ≥lg - el
// chrome móvil sigue con BottomNav/SideDrawer. Persiste por dispositivo
// y emite un evento para re-render sin recarga (mismo patrón que
// view-mode y active-role).
export type SidebarState = "expanded" | "collapsed";

export const SIDEBAR_STATE_EVENT = "omnidance:sidebar";
const STORAGE_KEY = "omnidance:sidebar";

export function getSidebarState(): SidebarState {
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

export function useSidebarState(): SidebarState {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(SIDEBAR_STATE_EVENT, onChange);
    return () => window.removeEventListener(SIDEBAR_STATE_EVENT, onChange);
  }, []);
  return getSidebarState();
}
