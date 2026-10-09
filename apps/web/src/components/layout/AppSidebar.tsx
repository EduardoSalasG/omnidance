"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { DrawerGroup, DrawerItem } from "./SideDrawer";

const NAV_ID = "app-sidebar-nav";

// Doble chevron del toggle - mismo lenguaje que los ICONS de BottomNav
// (viewBox 24, stroke currentColor, caps redondos). Apunta hacia el
// lado al que irá la sidebar: « al expandirse, » al colapsarse.
function ToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
    >
      {collapsed ? (
        <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />
      ) : (
        <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
      )}
    </svg>
  );
}

/**
 * Sidebar lateral fija - navegación principal en desktop (≥lg). Es el
 * mismo menú agrupado por dominio que el SideDrawer móvil (mismo shape
 * DrawerGroup), pero siempre visible y colapsable a riel de íconos.
 *
 * - Expandida (w-64): headers de grupo + ítems ícono+label.
 * - Colapsada (w-16): solo íconos centrados (tooltip nativo por title +
 *   aria-label) y separadores entre grupos en vez de headers.
 * - El estado vive fuera (sidebar-state.ts) y llega por props; el botón
 *   del footer dispara onToggle.
 * - hidden lg:flex: nunca compite con el BottomNav del chrome móvil.
 */
export function AppSidebar({
  groups,
  roleLabel,
  collapsed,
  onToggle,
}: {
  groups: DrawerGroup[];
  roleLabel?: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("nav");
  // Los grupos vacíos no renderizan nada (ni header ni separador) -
  // mismo filtro que SideDrawer, pero resuelto antes para que el
  // separador colapsado solo quede entre grupos con ítems reales.
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const toggleLabel = collapsed ? t("expandMenu") : t("collapseMenu");

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-line bg-surface transition-[width] duration-300 motion-reduce:transition-none lg:flex ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div
        className={`flex h-14 items-center border-b border-line ${
          collapsed ? "justify-center" : "justify-between pl-4 pr-2"
        }`}
      >
        {/* El toggle vive arriba, solo la flecha (label por aria/title).
            En riel colapsado ocupa el lugar de la marca - no hay ancho
            para ambos. */}
        {!collapsed && (
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-base font-bold">Omnidance</span>
            {roleLabel && (
              <span className="truncate text-xs text-neon">{roleLabel}</span>
            )}
          </div>
        )}
        <button
          type="button"
          data-tour="sidebar-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={NAV_ID}
          aria-label={toggleLabel}
          title={toggleLabel}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink/60 transition-colors hover:bg-elevated hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98]"
        >
          <ToggleIcon collapsed={collapsed} />
        </button>
      </div>

      <nav
        id={NAV_ID}
        data-tour="app-sidebar"
        aria-label={t("main")}
        className="flex-1 overflow-y-auto px-2 py-4"
      >
        <ul className={`flex flex-col ${collapsed ? "" : "gap-5"}`}>
          {visibleGroups.map((group, i) => (
            <SidebarGroup
              key={group.label}
              group={group}
              collapsed={collapsed}
              separated={collapsed && i > 0}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/**
 * Grupo de la sidebar desktop: header estático + ítems siempre visibles
 * (las secciones no se pliegan). En riel colapsado los ítems van planos
 * con separador entre grupos.
 */
function SidebarGroup({
  group,
  collapsed,
  separated,
}: {
  group: DrawerGroup;
  collapsed: boolean;
  separated: boolean;
}) {
  return (
    <li className={separated ? "mt-3 border-t border-line pt-3" : undefined}>
      {!collapsed && (
        <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink/40">
          {group.label}
        </h3>
      )}
      <ul className="flex flex-col">
        {group.items.map((item) => (
          <SidebarItem key={item.href} item={item} collapsed={collapsed} />
        ))}
      </ul>
    </li>
  );
}

function SidebarItem({
  item,
  collapsed,
}: {
  item: DrawerItem;
  collapsed: boolean;
}) {
  return (
    <li>
      <Link
        href={item.href}
        data-tour={item.dataTour}
        aria-current={item.active ? "page" : undefined}
        {...(collapsed
          ? { "aria-label": item.label, title: item.label }
          : {})}
        className={`flex min-h-11 items-center rounded-xl py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98] ${
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        } ${
          item.active
            ? "bg-neon/10 text-neon"
            : "text-ink/80 hover:bg-elevated hover:text-ink"
        }`}
      >
        <span
          aria-hidden
          className={item.active ? "text-neon" : "text-ink/50"}
        >
          {item.icon}
        </span>
        {!collapsed && item.label}
      </Link>
    </li>
  );
}
