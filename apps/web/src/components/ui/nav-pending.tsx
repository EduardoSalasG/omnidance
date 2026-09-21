"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Spinner } from "./spinner";

// La navegación por filtros es SSR con transición client-side: React
// mantiene la UI anterior hasta que llega el nuevo payload y el swap
// aparece de golpe (loading.tsx no re-suspende en cambios de
// searchParams de la misma ruta). Este wrapper muestra un overlay con
// spinner al tocar un link interno y lo retira cuando cambian
// pathname/searchParams — es decir, cuando la navegación pinta.
//
// Estándar de carga percibida (NN/g):
//  - <100ms se siente instantáneo → no mostrar nada.
//  - Un spinner de 200ms es "flash": hace la app sentirse MÁS lenta.
//    Por eso SHOW_DELAY_MS antes de aparecer — las navegaciones
//    rápidas (el caso común) no muestran nada.
//  - Si ya se mostró, MIN_VISIBLE_MS evita el parpadeo.

const SHOW_DELAY_MS = 200;
const MIN_VISIBLE_MS = 400;
const HARD_CLEAR_MS = 8000;

function NavWatcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => onNavigate(), [pathname, searchParams, onNavigate]);
  return null;
}

export function NavPendingOverlay({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = () => {
    shownAt.current = null;
    setVisible(false);
  };

  const arm = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (safeTimer.current) clearTimeout(safeTimer.current);
    showTimer.current = setTimeout(() => {
      shownAt.current = Date.now();
      setVisible(true);
    }, SHOW_DELAY_MS);
    // Navegación abortada o error: el overlay nunca queda pegado.
    safeTimer.current = setTimeout(hide, HARD_CLEAR_MS);
  };

  const settle = () => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (safeTimer.current) {
      clearTimeout(safeTimer.current);
      safeTimer.current = null;
    }
    if (shownAt.current === null) return; // nunca llegó a mostrarse
    const elapsed = Date.now() - shownAt.current;
    hideTimer.current = setTimeout(
      hide,
      Math.max(0, MIN_VISIBLE_MS - elapsed),
    );
  };

  useEffect(
    () => () => {
      [showTimer, hideTimer, safeTimer].forEach((t) => {
        if (t.current) clearTimeout(t.current);
      });
    },
    [],
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
        if (anchor.getAttribute("target") === "_blank" || anchor.hasAttribute("download")) {
          return;
        }
        const current = `${window.location.pathname}${window.location.search}`;
        if (href === current) return;
        arm();
      }}
    >
      {children}
      <Suspense fallback={null}>
        <NavWatcher onNavigate={settle} />
      </Suspense>
      {visible && (
        // Tap en el overlay lo cierra — si la navegación se abortó el
        // usuario no queda bloqueado esperando el hard-clear.
        <div
          role="presentation"
          onClick={hide}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-night-950/60 backdrop-blur-[2px]"
        >
          <Spinner size="lg" />
        </div>
      )}
    </div>
  );
}
