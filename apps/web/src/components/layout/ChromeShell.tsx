"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useViewMode } from "@/lib/view-mode";
import { BottomNav, CHROME_HIDDEN_PREFIXES } from "./BottomNav";

// Wrapper client del chrome de app: el appbar (hamburguesa + título +
// campana) es sticky en el flujo — ocupa su propio espacio, no se
// sobrepone al contenido. La tab bar sigue fixed → solo se reserva
// padding-bottom cuando el chrome se muestra (contextos fullscreen
// como la consola staff de puerta usan toda la pantalla). Además
// aplica el modo de vista (data-mode en <html>) que swappea el
// acento Social→Academia.
export function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const mode = useViewMode();
  const hidden = CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  return (
    <BottomNav>
      <div
        id="contenido"
        tabIndex={-1}
        className={`outline-none ${
          hidden
            ? ""
            : "pb-[calc(4rem+env(safe-area-inset-bottom))]"
        }`}
      >
        {children}
      </div>
    </BottomNav>
  );
}
