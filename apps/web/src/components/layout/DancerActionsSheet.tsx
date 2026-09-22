"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { MyQr } from "@/components/qr/MyQr";

export type SheetItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

/**
 * Sheet de acciones del bailarín — reemplaza al drawer lateral en la lente
 * DANCER. El "+" central del tab bar lo abre:
 *
 * - QR personal destacado (acción de pista: entrada + pareja de baile).
 * - Grid de módulos secundarios (Bailes, Prácticas, Viajes, …).
 * - role="dialog" + aria-modal; Escape / tap en backdrop / cambio de
 *   ruta (el padre) cierran. Focus trap + restauración vía
 *   useDialogFocus; slide-up por rAF + transition-transform;
 *   motion-reduce → instantáneo.
 */
export function DancerActionsSheet({
  open,
  onClose,
  items,
  scanHref,
}: {
  open: boolean;
  onClose: () => void;
  items: SheetItem[];
  /** Solo lente social: el bailarín escanea a su pareja. En academia la
      asistencia la registra el staff — no hay acción de escaneo. */
  scanHref?: string;
}) {
  const t = useTranslations("nav");
  const dialogRef = useDialogFocus<HTMLDivElement>(open);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

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
      className="fixed inset-0 z-50 bg-night-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("moreMenu")}
        className={`fixed inset-x-0 bottom-0 mx-auto max-w-lg rounded-t-3xl border-t border-night-700 bg-night-900 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl shadow-black/50 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grabber */}
        <div
          aria-hidden
          className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/20"
        />

        {/* QR destacado — la acción de pista */}
        <div className="flex justify-center">
          <MyQr compact />
        </div>

        {/* Escanear — la contraparte del QR propio: "me muestran" arriba,
            "yo escaneo" acá. Mismo peso visual que un ítem del grid pero
            ancho completo porque es la acción primaria del sheet. */}
        {scanHref && (
          <Link
            href={scanHref}
            onClick={onClose}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-neon/40 bg-neon/10 px-4 text-sm font-semibold text-neon transition-colors hover:bg-neon/20 active:scale-[0.98]"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
            </svg>
            {t("scanQr")}
          </Link>
        )}

        {/* Módulos secundarios — la lente academia del bailarín no tiene
            (sus módulos ya son tabs): el sheet queda solo con el QR. */}
        {items.length > 0 && (
          <nav aria-label={t("moreMenu")} className="mt-5">
            <ul className="grid grid-cols-2 gap-2">
              {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  onClick={onClose}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.98] ${
                    item.active
                      ? "bg-neon/10 text-neon"
                      : "bg-night-800/60 text-white/80 hover:bg-night-800 hover:text-white"
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
          </nav>
        )}
      </div>
    </div>
  );
}
