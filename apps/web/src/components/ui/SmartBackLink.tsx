"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent } from "react";

/**
 * SmartBackLink — back verdadero estilo iOS. Si el referrer es de la
 * app (cartelera, inicio, mapa, calendario) hace router.back() y
 * conserva scroll/filtros/vista; si la entrada fue directa (link de
 * WhatsApp, recarga, pestaña nueva) navega al `href` de fallback.
 * Sigue siendo un <a href> real — accesible y crawlable.
 */
export function SmartBackLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const router = useRouter();

  function onClick(e: MouseEvent) {
    if (
      typeof document !== "undefined" &&
      document.referrer.startsWith(window.location.origin)
    ) {
      e.preventDefault();
      router.back();
    }
    // referrer externo o vacío → navegación normal al href
  }

  return (
    <Link
      href={href}
      onClick={onClick}
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
