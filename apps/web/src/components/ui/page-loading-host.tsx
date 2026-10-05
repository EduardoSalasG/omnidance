"use client";

import { useSyncExternalStore } from "react";
import { Spinner } from "./spinner";
import { getLoadingVisible, subscribeLoading } from "./loading-beacon";

const getServerSnapshot = () => false;

// Host único del beacon de carga — montado en el root layout.
// pointer-events-none: el spinner informa sin bloquear (el usuario puede
// seguir navegando). El chip con backdrop-blur lo hace legible sobre
// cualquier contenido sin necesitar un velo de pantalla completa.
export function PageLoadingHost() {
  const show = useSyncExternalStore(
    subscribeLoading,
    getLoadingVisible,
    getServerSnapshot,
  );
  if (!show) return null;
  return (
    <div
      role="presentation"
      className="pointer-events-none fixed inset-x-0 top-14 bottom-20 z-[60] flex items-center justify-center"
    >
      <span className="loading-fade-in rounded-full bg-night-950/80 p-3 shadow-lg backdrop-blur-sm">
        <Spinner size="lg" />
      </span>
    </div>
  );
}
