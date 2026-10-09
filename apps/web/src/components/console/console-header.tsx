"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { isSidebarRoute } from "@/components/layout/BottomNav";
import { reportConsoleHeader } from "@/lib/console-header-state";

// Header de módulo de consola: back link al padre + slot de acciones.
// El back es un <a> real (iOS back) - no usa router.back() para que el
// destino sea predecible aunque se entre por deep link. El título de la
// sección lo muestra el large title del chrome (BottomNav).
//
// Solo las subpáginas (nivel ≥2: detalle, /nueva, /editar…) muestran el
// back con el nombre de la página anterior - un destino raíz del
// sidebar/drawer (isSidebarRoute) no lo pinta en ningún breakpoint:
// su navegación es el propio chrome.
export function ConsoleHeader({
  backHref,
  backLabel,
  actions,
}: {
  backHref: string;
  backLabel: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const isRoot = isSidebarRoute(pathname);

  // Mientras el header existe, el chevron ‹ del appbar se suprime -
  // este back (link real al padre) es el único "volver" visible.
  useEffect(() => {
    reportConsoleHeader(true);
    return () => reportConsoleHeader(false);
  }, []);

  if (isRoot && !actions) return null;

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-3 ${
        isRoot ? "justify-end" : ""
      }`}
    >
      {!isRoot && (
        <Link
          href={backHref}
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-ink/60 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <ChevronLeftIcon /> {backLabel}
        </Link>
      )}
      {actions}
    </header>
  );
}
