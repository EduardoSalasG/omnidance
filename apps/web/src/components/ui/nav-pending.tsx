"use client";

import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "./spinner";

// La navegación por filtros es SSR con transición client-side: React
// mantiene la UI anterior hasta que llega el nuevo payload y el swap
// aparece de golpe (loading.tsx no re-suspende en cambios de
// searchParams de la misma ruta). Este wrapper muestra un overlay con
// spinner al tocar un link interno y lo retira cuando cambian
// pathname/searchParams — es decir, cuando la navegación pinta.

function NavWatcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => onNavigate(), [pathname, searchParams, onNavigate]);
  return null;
}

export function NavPendingOverlay({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(false);

  // Seguro: si la navegación no cambia la URL (mismo destino, nav
  // abortada, error) el overlay no queda pegado.
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setPending(false), 8000);
    return () => clearTimeout(id);
  }, [pending]);

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
        const href = anchor?.getAttribute("href");
        if (!href?.startsWith("/")) return;
        const current = `${window.location.pathname}${window.location.search}`;
        if (href === current) return;
        setPending(true);
      }}
    >
      {children}
      <Suspense fallback={null}>
        <NavWatcher onNavigate={() => setPending(false)} />
      </Suspense>
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-night-950/60 backdrop-blur-[2px]">
          <Spinner size="lg" />
        </div>
      )}
    </div>
  );
}
