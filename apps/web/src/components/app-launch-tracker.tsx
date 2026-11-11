"use client";

import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { clientPlatform } from "@/lib/device";

// Telemetría de instalación/dispositivo (spec auth-sessions): emite
// `app.launch` una vez por arranque (flag en sessionStorage - una por
// sesión de pestaña y una sola en el double-mount de StrictMode) con el
// modo de display y la plataforma. Best effort: nunca bloquea ni rompe
// el arranque; renderiza nada.
const LAUNCH_KEY = "omnidance:app-launch";

export function AppLaunchTracker() {
  useEffect(() => {
    if (sessionStorage.getItem(LAUNCH_KEY)) return;
    sessionStorage.setItem(LAUNCH_KEY, "1");
    const displayMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
        ? "standalone"
        : "browser";
    const platform = clientPlatform();
    void apiFetch("/analytics/track", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "app.launch", displayMode, platform }),
    }).catch(() => {
      // La telemetría nunca rompe el arranque.
    });
  }, []);
  return null;
}
