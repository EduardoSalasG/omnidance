import { useTranslations } from "next-intl";

// Skeletons - placeholder con la forma del contenido real.
// Perceived performance (NN/g): para cargas de contenido cuyo layout
// es conocido (listas, cards, detalle), un skeleton se percibe más
// corto que un spinner porque anticipa la estructura. El spinner
// queda reservado a ACCIONES (botón presionado, submit) y a esperas
// de forma desconocida (gates de sesión/rol → PageLoading).
//
// `.page-loading` difiere la aparición 200ms (mismo estándar que el
// beacon): fetches rápidos pintan el contenido directo, sin flash.
// motion-reduce apaga el pulse - los bloques quedan estáticos.

export type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-elevated motion-reduce:animate-none ${className}`}
    />
  );
}

export type SkeletonTextProps = {
  lines?: number;
  className?: string;
};

/** Grupo de líneas de texto - la última más corta, como un párrafo real. */
export function SkeletonText({ lines = 2, className = "" }: SkeletonTextProps) {
  const widths = ["w-full", "w-5/6", "w-2/3", "w-1/2"];
  return (
    <div
      aria-hidden="true"
      className={`page-loading flex flex-col gap-2 ${className}`}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? "w-2/3" : widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}

export type SkeletonCardProps = {
  /** Líneas de texto dentro de la card. */
  lines?: number;
  /** Barra alta tipo título sobre las líneas. */
  title?: boolean;
};

/** Card skeleton - misma envoltura que Card (radio/borde/fondo/padding). */
export function SkeletonCard({ lines = 2, title = true }: SkeletonCardProps) {
  return (
    <div
      aria-hidden="true"
      className="page-loading flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5"
    >
      {title && <Skeleton className="h-5 w-2/3" />}
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? "w-full" : "w-1/2"}`} />
      ))}
    </div>
  );
}

export type SkeletonListProps = {
  items?: number;
  /** Líneas por card. */
  lines?: number;
  /** Texto sr-only para lectores de pantalla. Default: common.loading. */
  label?: string;
  className?: string;
};

/** Lista de cards skeleton - el estado de carga estándar de las
 * secciones de contenido. role="status" + sr-only anuncian la carga;
 * las cards son aria-hidden (no hay contenido real que nombrar). */
export function SkeletonList({
  items = 3,
  lines = 2,
  label,
  className = "",
}: SkeletonListProps) {
  const tc = useTranslations("common");
  return (
    <div role="status" className={`flex flex-col gap-3 ${className}`}>
      <span className="sr-only">{label ?? tc("loading")}</span>
      {Array.from({ length: items }, (_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  );
}
