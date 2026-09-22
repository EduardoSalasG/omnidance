import { useTranslations } from "next-intl";
import { PageLoadingBeacon } from "./loading-beacon";

export type SpinnerSize = "sm" | "md" | "lg";

const sizes: Record<SpinnerSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

export type SpinnerProps = {
  size?: SpinnerSize;
  /** Texto sr-only para lectores de pantalla. Default: common.loading. */
  label?: string;
  className?: string;
};

// Spinner accesible: svg animado con motion-reduce, role="status" +
// texto sr-only localizable via prop o common.loading por defecto.
// Con prefers-reduced-motion el arco no gira: se reemplaza por un punto
// con pulse de opacidad sutil (equivalente no vestibular).
export function Spinner({ size = "md", label, className = "" }: SpinnerProps) {
  const tc = useTranslations("common");
  return (
    <span role="status" className={`inline-flex items-center ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className={`${sizes[size]} animate-spin motion-reduce:hidden`}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="3"
          className="text-white/20"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-neon"
        />
      </svg>
      <span
        aria-hidden="true"
        className={`${sizes[size]} hidden animate-pulse rounded-full bg-neon/60 motion-reduce:inline-block`}
      />
      <span className="sr-only">{label ?? tc("loading")}</span>
    </span>
  );
}

export type PageLoadingProps = {
  label?: string;
};

/** Estado de carga a nivel página/panel. NO usar min-h-dvh: hay chrome
 * sticky. El spinner real lo renderiza PageLoadingHost (layout raíz)
 * via beacon compartido: aparición diferida 200ms + mínimo visible
 * 400ms — fetches rápidos no muestran nada y una vez visible no hay
 * flash. Este componente solo reserva el alto y mantiene el acquire
 * mientras la página está cargando. Para feedback de ACCIÓN (botón
 * presionado, submit) usar Spinner inline directo: ahí la respuesta
 * debe ser inmediata. */
export function PageLoading({ label }: PageLoadingProps) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <PageLoadingBeacon />
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}
