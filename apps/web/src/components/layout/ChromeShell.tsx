"use client";

import { usePathname } from "next/navigation";
import { BottomNav, CHROME_HIDDEN_PREFIXES } from "./BottomNav";

// Wrapper client del chrome de app: el appbar (hamburguesa + título +
// campana) es sticky en el flujo — ocupa su propio espacio, no se
// sobrepone al contenido. La tab bar sigue fixed → solo se reserva
// padding-bottom cuando el chrome se muestra (contextos fullscreen
// como la consola staff de puerta usan toda la pantalla).
// El acento (data-mode en <html>) lo aplica BottomNav — necesita el
// rol activo para decidir verde academia vs morado.
export function ChromeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hidden = CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

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
