"use client";

import { usePathname } from "next/navigation";
import { BottomNav, CHROME_HIDDEN_PREFIXES } from "./BottomNav";

// Wrapper client del chrome de app: reserva el espacio vertical del
// floating header (hamburguesa + large title) y de la tab bar solo
// cuando el chrome se muestra — en contextos fullscreen (consola staff
// de puerta) el contenido usa toda la pantalla.
export function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hidden = CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
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
