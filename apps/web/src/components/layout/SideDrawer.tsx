"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useDialogFocus } from "@/lib/useDialogFocus";

export type DrawerItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
};

export type DrawerGroup = {
  label: string;
  items: DrawerItem[];
};

/**
 * Drawer lateral — menú secundario de la app. El BottomNav queda con las
 * funciones primarias del rol + Perfil; todo lo demás vive acá, agrupado
 * por dominio (Social / Consola del rol / etc.).
 *
 * - role="dialog" + aria-modal; overlay + panel que entra desde la derecha
 *   (el botón hamburguesa está en la esquina superior derecha del AppBar).
 * - Escape / tap en overlay / cambio de ruta (el padre) cierran.
 * - Focus trap + restauración vía useDialogFocus; slide por rAF +
 *   transition-transform; motion-reduce → instantáneo.
 */
export function SideDrawer({
  open,
  onClose,
  groups,
  roleLabel,
}: {
  open: boolean;
  onClose: () => void;
  groups: DrawerGroup[];
  roleLabel?: string;
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
        id="app-side-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("menu")}
        className={`fixed inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-night-700 bg-night-900 shadow-2xl shadow-black/50 transition-transform duration-300 ease-out motion-reduce:transition-none ${
          entered ? "translate-x-0" : "-translate-x-full"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-night-700 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
          <div className="flex flex-col">
            <span className="text-base font-bold">Omnidance</span>
            {roleLabel && (
              <span className="text-xs text-neon">{roleLabel}</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("closeMenu")}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-night-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav
          aria-label={t("menu")}
          className="flex-1 overflow-y-auto px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <ul className="flex flex-col gap-5">
            {groups.map(
              (group) =>
                group.items.length > 0 && (
                  <li key={group.label}>
                    <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-white/40">
                      {group.label}
                    </h3>
                    <ul className="flex flex-col">
                      {group.items.map((item) => (
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
                              className={
                                item.active ? "text-neon" : "text-white/50"
                              }
                            >
                              {item.icon}
                            </span>
                            {item.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                ),
            )}
          </ul>
        </nav>
      </div>
    </div>
  );
}
