"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { isSidebarRoute } from "@/components/layout/BottomNav";

// Header de módulo de consola: back link al hub + slot de acciones.
// El back es un <a> real (iOS back) - no usa router.back() para que el
// destino sea predecible aunque se entre por deep link. El título de la
// sección lo muestra el large title del chrome (BottomNav).
// En desktop (≥lg) el back se oculta cuando la página ya es un destino
// directo de la sidebar - ahí es redundante; solo las subpáginas
// (detalle, /nueva, etc.) lo conservan.
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
  const hideBackDesktop = isSidebarRoute(pathname);

  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-3 ${
        hideBackDesktop ? "lg:justify-end" : ""
      }`}
    >
      <Link
        href={backHref}
        className={`inline-flex min-h-11 w-fit items-center gap-1 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
          hideBackDesktop ? "lg:hidden" : ""
        }`}
      >
        <ChevronLeftIcon /> {backLabel}
      </Link>
      {actions}
    </header>
  );
}
