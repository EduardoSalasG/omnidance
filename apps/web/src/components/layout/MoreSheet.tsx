"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useDialogFocus } from "@/lib/useDialogFocus";

export type MoreSheetItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

/**
 * Bottom sheet "Más" — menú secundario del BottomNav con las secciones
 * que no caben en los 5 tabs (filtradas por rol en BottomNav).
 *
 * - role="dialog" + aria-modal + aria-label; montado por encima del nav
 *   (z-50 sobre z-40) con safe-area abajo.
 * - Cierra con Escape o tocando el overlay; cada link también dispara
 *   onClose (y el cambio de pathname lo cierra desde el padre).
 * - Focus trap + restauración vía useDialogFocus (mismo patrón que el
 *   modal de "Regalar entrada" en /entradas).
 * - Slide-up por rAF + transition-transform; motion-reduce lo deja
 *   instantáneo (además globals.css ya aplana transitions).
 */
export function MoreSheet({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: MoreSheetItem[];
}) {
  const t = useTranslations("nav");
  const dialogRef = useDialogFocus<HTMLDivElement>(open);
  const [entered, setEntered] = useState(false);

  // Entra/sale: el nodo monta fuera de pantalla y transiciona a visible
  // en el próximo frame (mismo patrón rAF que NotificationToast).
  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Escape cierra — Tab/Shift+Tab los cicla useDialogFocus.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        id="nav-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t("moreMenu")}
        className={`w-full max-w-lg rounded-t-2xl border-t border-night-700 bg-night-900 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-black/50 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          className="mx-auto mb-3 h-1 w-10 rounded-full bg-night-700"
        />
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("moreMenu")}
        </h2>
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                onClick={onClose}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors active:scale-[0.98] ${
                  item.active
                    ? "bg-neon/10 text-neon"
                    : "text-white/80 hover:bg-night-800 hover:text-white"
                }`}
              >
                <span
                  aria-hidden
                  className={item.active ? "text-neon" : "text-white/50"}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
