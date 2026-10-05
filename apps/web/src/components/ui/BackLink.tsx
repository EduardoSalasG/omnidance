import Link from "next/link";
import type { ReactNode } from "react";

/**
 * BackLink — patrón de retorno estilo iOS: pill compacto con chevron
 * + nombre del destino. Reemplaza el "← Texto" desnudo: mismo gesto,
 * tap target generoso y chrome consistente con los iconBtn del app.
 */
export function BackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 w-fit items-center gap-0.5 rounded-full border border-white/10 bg-white/5 pl-2.5 pr-4 text-sm font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white active:scale-[0.97] ${className}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </Link>
  );
}
