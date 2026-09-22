"use client";

import { Suspense, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  acquirePageLoading,
  releasePageLoading,
} from "./loading-beacon";

// La navegación por filtros es SSR con transición client-side: React
// mantiene la UI anterior hasta que llega el nuevo payload y el swap
// aparece de golpe (loading.tsx no re-suspende en cambios de
// searchParams de la misma ruta). Este wrapper hace acquire del beacon
// de carga compartido al tocar un link interno y lo suelta cuando cambian
// pathname/searchParams — es decir, cuando la navegación pinta. Si la
// página destino sigue cargando data, su PageLoading mantiene el beacon:
// un solo spinner continuo de principio a fin.
//
// El estándar de carga percibida (delay + min-visible) vive en
// loading-beacon — acá solo se decide CUÁNDO adquirir/soltar.

const HARD_CLEAR_MS = 8000;

function NavWatcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Solo notificar cuando la URL realmente cambió — un re-render del
  // padre (p.ej. al encender el beacon) no es una navegación.
  const prev = useRef(`${pathname}?${searchParams}`);
  useEffect(() => {
    const current = `${pathname}?${searchParams}`;
    if (current === prev.current) return;
    prev.current = current;
    onNavigate();
  }, [pathname, searchParams, onNavigate]);
  return null;
}

export function NavPendingOverlay({ children }: { children: ReactNode }) {
  const holding = useRef(false);
  const safeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const release = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    if (safeTimer.current) {
      clearTimeout(safeTimer.current);
      safeTimer.current = null;
    }
    releasePageLoading();
  }, []);

  const arm = useCallback(() => {
    if (holding.current) return;
    holding.current = true;
    acquirePageLoading();
    // Navegación abortada o error: el beacon nunca queda pegado.
    safeTimer.current = setTimeout(release, HARD_CLEAR_MS);
  }, [release]);

  useEffect(
    () => () => {
      if (safeTimer.current) clearTimeout(safeTimer.current);
      release();
    },
    [release],
  );

  return (
    <div
      onClickCapture={(e) => {
        if (
          e.defaultPrevented ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey ||
          e.altKey
        ) {
          return;
        }
        const anchor = (e.target as HTMLElement).closest?.("a[href]");
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href?.startsWith("/")) return;
        if (
          anchor.getAttribute("target") === "_blank" ||
          anchor.hasAttribute("download")
        ) {
          return;
        }
        const current = `${window.location.pathname}${window.location.search}`;
        if (href === current) return;
        arm();
      }}
    >
      {children}
      <Suspense fallback={null}>
        <NavWatcher onNavigate={release} />
      </Suspense>
    </div>
  );
}
