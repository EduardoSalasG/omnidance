import Link from "next/link";

// Header de módulo de consola: back link al hub + slot de acciones.
// El back es un <a> real (iOS back) — no usa router.back() para que el
// destino sea predecible aunque se entre por deep link. El título de la
// sección lo muestra el large title del chrome (BottomNav).
export function ConsoleHeader({
  backHref,
  backLabel,
  actions,
}: {
  backHref: string;
  backLabel: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <Link
        href={backHref}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
      >
        <span aria-hidden="true">‹</span> {backLabel}
      </Link>
      {actions}
    </header>
  );
}
