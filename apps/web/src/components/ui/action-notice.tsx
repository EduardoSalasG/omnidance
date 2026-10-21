"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "./icons";

const VISIBLE_MS = 3_000;
const EXIT_MS = 200;

/**
 * Aviso fijo post-acción, flotando sobre la BottomNav - para acciones
 * cuyo punto de origen puede quedar fuera del viewport (listas largas,
 * barras fijas). No es un sistema de toasts global: el padre guarda el
 * estado `notice` y el atom solo lo presenta - sin event bus ni estado
 * compartido (decisión del change success-feedback-audit).
 *
 * - `role="status"` en éxito / `role="alert"` en error: los lectores
 *   de pantalla anuncian el texto sin robar foco.
 * - Auto-dismiss ~3s; entrada/salida translate+fade, apagada con
 *   `motion-reduce:` (aparición instantánea).
 * - Mismo offset bottom que la barra de reserva de la ficha de clase.
 * - No se exporta por el barrel `index.ts`: importar por path directo
 *   `@/components/ui/action-notice`.
 */
export function ActionNotice({
  notice,
  onDismiss,
}: {
  /** Texto ya traducido; `error` pinta rojo + role="alert". */
  notice: { text: string; error?: boolean } | null;
  /** El padre limpia `notice` - requerido para cerrar/auto-dismiss. */
  onDismiss?: () => void;
}) {
  const t = useTranslations("realtime.toast");
  const [entered, setEntered] = useState(false);
  const timersRef = useRef<number[]>([]);
  // onDismiss suele ser inline en el padre - ref para no reiniciar el
  // ciclo de vida del aviso en cada render.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  function clearTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  useEffect(() => {
    if (!notice) return;
    // rAF: el nodo monta ya oculto y transiciona a visible en el próximo
    // frame (mismo patrón que NotificationToast).
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    timersRef.current.push(
      window.setTimeout(() => setEntered(false), VISIBLE_MS),
      window.setTimeout(
        () => onDismissRef.current?.(),
        VISIBLE_MS + EXIT_MS,
      ),
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimers();
    };
  }, [notice]);

  function dismiss() {
    clearTimers();
    setEntered(false);
    timersRef.current.push(
      window.setTimeout(() => onDismissRef.current?.(), EXIT_MS),
    );
  }

  if (!notice) return null;

  const error = notice.error === true;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pb-3">
      <div
        role={error ? "alert" : "status"}
        className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border bg-surface/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur transition-all duration-300 ease-out motion-reduce:transition-none ${
          error ? "border-red-400/40" : "border-neon/40"
        } ${entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
      >
        <span
          aria-hidden
          className={`shrink-0 ${error ? "text-red-400" : "text-neon"}`}
        >
          {error ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          ) : (
            <CheckIcon className="h-5 w-5" />
          )}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">
          {notice.text}
        </p>
        {onDismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("close")}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-ink/50 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
