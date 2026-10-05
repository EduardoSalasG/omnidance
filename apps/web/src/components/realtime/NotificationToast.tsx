"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { RealtimeNotification } from "@/lib/realtime";
import { useRealtime } from "./RealtimeProvider";

const VISIBLE_MS = 5000;
const EXIT_MS = 200;

/**
 * Toast/banner discreto para notificaciones entrantes por socket.
 *
 * - Aparece cuando `latestNotification` del contexto cambia; auto-dismiss 5s.
 * - Entra/sale con transición translate+fade, desactivada con
 *   `motion-reduce:` (prefers-reduced-motion → aparición instantánea).
 * - role="status" + aria-live="polite": los lectores de pantalla anuncian el
 *   contenido sin robar foco. El botón cerrar es focuseable con teclado.
 * - Fixed top con padding de safe-area (notch iOS) y z sobre el contenido.
 * - Tap en el cuerpo navega a /notificaciones; la X solo descarta el toast.
 */

type CategoryMeta = { color: string; paths: string[] };

// `type` es libre en backend → el icono se mapea por `category` (enum cerrado:
// SOCIAL | TRANSACTIONAL | MARKETING | OPERATIONAL). Mismo estilo de iconos
// stroke que BottomNav.
const CATEGORY_META: Record<string, CategoryMeta> = {
  SOCIAL: {
    color: "text-neon",
    paths: [
      "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
      "M23 21v-2a4 4 0 0 0-3-3.87",
      "M16 3.13a4 4 0 0 1 0 7.75",
      "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    ],
  },
  TRANSACTIONAL: {
    color: "text-emerald-400",
    paths: [
      "M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z",
      "M13 5v2M13 17v2M13 11v2",
    ],
  },
  MARKETING: {
    color: "text-amber-400",
    paths: [
      "M3 11l18-5v12L3 13v-2z",
      "M11.6 16.8a3 3 0 1 1-5.8-1.6",
    ],
  },
  OPERATIONAL: {
    color: "text-sky-400",
    paths: [
      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
      "M12 16v-4M12 8h.01",
    ],
  },
};

const FALLBACK_META: CategoryMeta = {
  color: "text-white/60",
  paths: [
    "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9",
    "M13.7 21a2 2 0 0 1-3.4 0",
  ],
};

export function NotificationToast() {
  const t = useTranslations("realtime.toast");
  const { latestNotification } = useRealtime();
  const [shown, setShown] = useState<RealtimeNotification | null>(null);
  const [entered, setEntered] = useState(false);
  const timersRef = useRef<number[]>([]);

  function clearTimers() {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }

  useEffect(() => {
    if (!latestNotification) return;
    clearTimers();
    setShown(latestNotification);
    setEntered(false);
    // rAF: el nodo monta ya oculto y transiciona a visible en el próximo frame.
    const raf = requestAnimationFrame(() => setEntered(true));
    timersRef.current.push(
      window.setTimeout(() => setEntered(false), VISIBLE_MS),
      window.setTimeout(() => setShown(null), VISIBLE_MS + EXIT_MS),
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimers();
    };
  }, [latestNotification]);

  function dismiss() {
    clearTimers();
    setEntered(false);
    timersRef.current.push(
      window.setTimeout(() => setShown(null), EXIT_MS),
    );
  }

  if (!shown) return null;

  const meta = CATEGORY_META[shown.category] ?? FALLBACK_META;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(3.5rem+0.5rem+env(safe-area-inset-top))]"
    >
      <div
        className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-night-700 bg-night-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur transition-all duration-300 ease-out motion-reduce:transition-none ${
          entered ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
        }`}
      >
        <span aria-hidden className={`mt-0.5 shrink-0 ${meta.color}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            {meta.paths.map((d) => (
              <path key={d} d={d} />
            ))}
          </svg>
        </span>

        <Link
          href="/notificaciones"
          onClick={dismiss}
          aria-label={t("open")}
          className="min-w-0 flex-1 rounded-lg"
        >
          <span className="block truncate text-sm font-semibold text-white">
            {shown.title}
          </span>
          {shown.body ? (
            <span className="mt-0.5 line-clamp-2 block text-sm text-white/60">
              {shown.body}
            </span>
          ) : null}
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("close")}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-white/50 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
