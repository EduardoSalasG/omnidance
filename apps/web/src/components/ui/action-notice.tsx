"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, XIcon } from "./icons";

const VISIBLE_MS = 3_000;
const EXIT_MS = 200;

/**
 * Aviso fijo post-acción, flotando sobre la BottomNav - para acciones
 * cuyo punto de origen puede quedar fuera del viewport (listas largas,
 * barras fijas).
 *
 * Dos vías de uso (decisión del change unified-action-notice):
 * - Local: el padre guarda el estado `notice` y el atom solo lo
 *   presenta; muere al desmontar la página (feedback que no navega).
 * - Global: `showActionNotice(notice)` emite un CustomEvent y persiste
 *   el aviso en sessionStorage; `ActionNoticeHost` (montado una vez en
 *   el layout de (app)) lo muestra en la página destino, así un aviso
 *   emitido justo antes de `router.push` sobrevive a la navegación.
 *
 * - `role="status"` en éxito / `role="alert"` en error: los lectores
 *   de pantalla anuncian el texto sin robar foco.
 * - Auto-dismiss ~3s; entrada/salida translate+fade, apagada con
 *   `motion-reduce:` (aparición instantánea).
 * - Mismo offset bottom que la barra de reserva de la ficha de clase.
 * - No se exporta por el barrel `index.ts`: importar por path directo
 *   `@/components/ui/action-notice`.
 */
/** Shape del aviso post-acción; los padres guardan esto en estado. */
export type ActionNoticeData = {
  text: string;
  /** true pinta rojo + role="alert". */
  error?: boolean;
  /** CTA opcional dentro del aviso (ej. "Agregar al calendario" tras
      reservar): link same-origin, con `download` para assets como .ics. */
  action?: { href: string; label: string; download?: boolean };
};

export function ActionNotice({
  notice,
  onDismiss,
}: {
  /** Texto ya traducido; `error` pinta rojo + role="alert". */
  notice: ActionNoticeData | null;
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 pb-3 lg:bottom-6">
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
        {notice.action && (
          <a
            href={notice.action.href}
            {...(notice.action.download ? { download: true } : {})}
            className="shrink-0 rounded-md text-sm font-semibold text-neon underline-offset-4 transition-colors hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon"
          >
            {notice.action.label}
          </a>
        )}
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

// ─── Host global (change unified-action-notice) ───
// `showActionNotice` anuncia el aviso por CustomEvent y lo persiste en
// sessionStorage: el evento lo muestra al instante el host ya montado
// y el storage lo rescata si el host remonta o la navegación recarga.
const ACTION_NOTICE_EVENT = "omnidance:action-notice";
const ACTION_NOTICE_STORAGE_KEY = "omnidance.action-notice";
// El persistido solo cubre una navegación/remount inmediato; un aviso
// más viejo se descarta para no revivir toasts de otra sesión.
const STORAGE_TTL_MS = 10_000;

function clearStoredNotice() {
  try {
    sessionStorage.removeItem(ACTION_NOTICE_STORAGE_KEY);
  } catch {
    // Storage bloqueado o lleno: el aviso en memoria alcanza.
  }
}

/**
 * Emite un aviso global post-acción. El último emitido gana; se muestra
 * en la página actual y sobrevive a la navegación siguiente.
 */
export function showActionNotice(notice: ActionNoticeData): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      ACTION_NOTICE_STORAGE_KEY,
      JSON.stringify({ notice, at: Date.now() }),
    );
  } catch {
    // Storage bloqueado o lleno: el evento en memoria alcanza.
  }
  window.dispatchEvent(
    new CustomEvent<ActionNoticeData>(ACTION_NOTICE_EVENT, {
      detail: notice,
    }),
  );
}

/**
 * Host único del aviso global - montado una vez en el layout de (app).
 * Escucha el CustomEvent y consume el pendiente de sessionStorage al
 * montar (avisos emitidos antes de que el host existiera).
 */
export function ActionNoticeHost() {
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);

  useEffect(() => {
    // Consume el aviso pendiente: cubre avisos emitidos antes de montar
    // (children montan antes que el host) o tras una recarga completa.
    try {
      const raw = sessionStorage.getItem(ACTION_NOTICE_STORAGE_KEY);
      if (raw) {
        sessionStorage.removeItem(ACTION_NOTICE_STORAGE_KEY);
        const stored = JSON.parse(raw) as {
          notice?: ActionNoticeData;
          at?: number;
        };
        if (
          typeof stored.notice?.text === "string" &&
          typeof stored.at === "number" &&
          Date.now() - stored.at < STORAGE_TTL_MS
        ) {
          setNotice(stored.notice);
        }
      }
    } catch {
      // JSON corrupto o storage bloqueado: se descarta el pendiente.
    }

    function onNotice(event: Event) {
      const detail = (event as CustomEvent<ActionNoticeData>).detail;
      if (!detail) return;
      // El persistido queda hasta el dismiss: si el layout remonta con
      // el aviso visible, la lectura al montar lo vuelve a mostrar.
      setNotice(detail);
    }
    window.addEventListener(ACTION_NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(ACTION_NOTICE_EVENT, onNotice);
  }, []);

  function dismiss() {
    setNotice(null);
    clearStoredNotice();
  }

  return <ActionNotice notice={notice} onDismiss={dismiss} />;
}
