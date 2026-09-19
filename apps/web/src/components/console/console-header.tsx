import Link from "next/link";

// Header de módulo de consola: back link al hub + título + slot de acciones.
// El back es un <a> real (iOS large-title back) — no usa router.back() para
// que el destino sea predecible aunque se entre por deep link.
export function ConsoleHeader({
  backHref,
  backLabel,
  title,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <Link
        href={backHref}
        className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-white/60 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
      >
        <span aria-hidden="true">‹</span> {backLabel}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        {actions}
      </div>
    </header>
  );
}
