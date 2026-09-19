import Link from "next/link";

// Tarjeta de módulo para hubs de consola — patrón "lista de ajustes" iOS:
// label + descripción + chevron, target ≥44px, focus ring neon.
export function ModuleCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc?: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-night-700 bg-night-900 p-4 transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
    >
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        {desc && <span className="text-xs text-white/50">{desc}</span>}
      </span>
      <span
        aria-hidden="true"
        className="text-white/30 transition-colors group-hover:text-neon"
      >
        ›
      </span>
    </Link>
  );
}

export function ModuleGrid({ children }: { children: React.ReactNode }) {
  return (
    <nav
      aria-label="Módulos"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {children}
    </nav>
  );
}
