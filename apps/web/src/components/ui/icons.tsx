// Iconos stroke del set de la app - mismo lenguaje que ICONS de
// BottomNav: viewBox 24, stroke currentColor, caps/joins redondos.
// Todos son decorativos (aria-hidden): el nombre accesible lo aporta
// el texto o el aria-label del elemento padre.
import type { ReactNode } from "react";

export type IconProps = {
  className?: string;
  /** Grosor del trazo - 1.8–2.4 según el set (2 por defecto). */
  strokeWidth?: number;
};

function Svg({
  className = "h-4 w-4",
  strokeWidth = 2,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Affordance de navegación / "ver más" (antes `→` / `›`). */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

/** Navegación hacia atrás / página anterior (antes `←`). */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

/** Expandir/colapsar hacia abajo (antes `↓`); rotar -90° da el ▸. */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

/** Reintentar una carga (antes `↻`). */
export function RefreshIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" />
    </Svg>
  );
}

/** Link externo (WhatsApp, mapas, video) - antes `↗`. */
export function ArrowUpRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17L17 7M8 7h9v9" />
    </Svg>
  );
}

/** Marca de selección/estado positivo (antes `✓`). */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

/** Quitar/cerrar (antes `✕`). */
export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

/** Agregar / crear nuevo (antes `＋` de texto). */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Reproducir video externo (antes `▸`). */
export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 3l14 9-14 9z" />
    </Svg>
  );
}

/** Estrella de puntuación - filled la encendida, outline la apagada
    (antes `★`/`☆` de texto). */
export function StarIcon({
  filled = false,
  className = "h-4 w-4",
}: {
  filled?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}
