"use client";

import type { ReactNode } from "react";

/**
 * <details> cuyo panel se cierra con Escape - el elemento nativo no lo
 * hace. El cierre por click-afuera sigue siendo CSS puro (p.ej. la capa
 * `details.venue-filter[open] > summary::before` de globals.css), así
 * la página puede seguir siendo server component y solo este wrapper
 * es client. Al cerrar, el foco vuelve al <summary>.
 *
 * Uso: pasar `key` en el call-site para remontar cerrado tras una
 * navegación client-side (el estado open no es controlado).
 */
export function EscapableDetails({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={className}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.open = false;
        e.currentTarget.querySelector("summary")?.focus();
      }}
    >
      {children}
    </details>
  );
}
