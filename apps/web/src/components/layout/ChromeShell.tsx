"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useViewMode } from "@/lib/view-mode";
import { BottomNav, CHROME_HIDDEN_PREFIXES } from "./BottomNav";

// Wrapper client del chrome de app: reserva el espacio vertical del
// floating header (hamburguesa + large title) y de la tab bar solo
// cuando el chrome se muestra — en contextos fullscreen (consola staff
// de puerta) el contenido usa toda la pantalla. Además aplica el modo
// de vista (data-mode en <html>) que swappea el acento Social→Academia.
export function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = useViewMode();
  const hidden = CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return (
    <>
      <div
        id="contenido"
        tabIndex={-1}
        className={`outline-none ${
          hidden
            ? ""
            : "pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[calc(6.75rem+env(safe-area-inset-top))]"
        }`}
      >
        {children}
      </div>
      <BottomNav />
    </>
  );
}
