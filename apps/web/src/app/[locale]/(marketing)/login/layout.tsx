import type { Metadata } from "next";

import { getMessages } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "Entrar con tu correo",
  alternates: { canonical: "/login" },
};

// Barra superior del login: misma voz visual que el header de la landing
// (Landing.tsx) - marca a la izquierda y salida a la derecha. Es la única
// ruta de escape hacia `/` para quien aterriza aquí sin querer entrar
// (deep-link con ?next= o share del magic link).
export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const m = (await getMessages()) as typeof import("@/i18n/catalogs/es-CL").default;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-ink/5 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-sm font-bold tracking-tight"
          >
            Omni<span className="text-neon">dance</span>
          </Link>
          <nav aria-label={m.landing.navPrimary}>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-ink/60 transition-colors hover:text-ink sm:px-4"
            >
              {m.common.back}
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
