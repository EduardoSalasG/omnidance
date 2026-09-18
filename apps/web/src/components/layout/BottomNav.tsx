"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { MoreSheet, type MoreSheetItem } from "./MoreSheet";

// Tab bar inferior — el pulgar manda en la pista. Se oculta en contextos
// de pantalla completa (escáneres, consola staff) donde estorba. Login ya
// no comparte layout: vive en (marketing) sin BottomNav. 5 tabs fijos:
// el quinto ("Más") es un botón que abre una hoja con el resto de secciones.
const HIDDEN_PREFIXES = ["/escanear", "/staff/"];

// Re-emisión DOM del socket — ver RealtimeProvider (notification → CustomEvent).
const NOTIFICATION_EVENT = "omnidance:notification";

type Me = { id: string; name: string; roles: string[] };

type Tab = {
  href: string;
  key: "home" | "events" | "scan" | "notifications";
  icon: (active: boolean) => React.ReactNode;
  center?: boolean;
};

// Claves nav.* de los ítems de la hoja "Más".
type MoreItemKey =
  | "profile"
  | "qr"
  | "dances"
  | "tickets"
  | "practices"
  | "trips"
  | "staff"
  | "producer"
  | "crm"
  | "academy"
  | "admin";

function icon(path: string) {
  return (active: boolean) => (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z",
  events:
    "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2",
  dances:
    "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  scan: "M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10",
  tickets:
    "M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1zm13-5v2m0 10v2m0-8v2",
  notifications:
    "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  profile:
    "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  // Grilla 2×2 — "hay más secciones acá".
  more: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  qr: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h.01M18 15h.01M21 15h.01M15 18h.01M18 18h.01M21 18h.01M15 21h.01M18 21h.01M21 21h.01",
  practices:
    "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  trips:
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  staff:
    "M8 2h8a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m3 10 2 2 4-4",
  producer: "m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  crm: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  academy: "M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 10v6",
  admin:
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zm-11 7 2 2 4-4",
};

const TABS: Tab[] = [
  { href: "/inicio", key: "home", icon: icon(ICONS.home) },
  { href: "/eventos", key: "events", icon: icon(ICONS.events) },
  { href: "/escanear", key: "scan", icon: icon(ICONS.scan), center: true },
  {
    href: "/notificaciones",
    key: "notifications",
    icon: icon(ICONS.notifications),
  },
];

/** unreadCount acotado para el badge — 99+ como en el home hub. */
function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // null = sin sesión (o fetch aún no responde con certeza) → sin badge.
  const [unread, setUnread] = useState<number | null>(null);
  // null = sin sesión → la hoja "Más" muestra solo Perfil.
  const [me, setMe] = useState<Me | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  // Baseline de no-leídas: solo si hay sesión. Un 401 deja unread en null
  // (mismo patrón de catch silencioso que apiFetch("/me") en HomeHub).
  useEffect(() => {
    let cancelled = false;
    apiFetch("/notifications?limit=1")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { unreadCount?: number };
        setUnread(data.unreadCount ?? 0);
      })
      .catch(() => {});
    const onNotify = () => setUnread((u) => (u ?? 0) + 1);
    window.addEventListener(NOTIFICATION_EVENT, onNotify);
    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATION_EVENT, onNotify);
    };
  }, []);

  // Roles para filtrar los ítems de la hoja "Más" — una sola vez, con el
  // mismo patrón de catch silencioso que el badge (401 → me queda null).
  useEffect(() => {
    let cancelled = false;
    apiFetch("/me")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setMe((await res.json()) as Me);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // La página /notificaciones marca leídas por ítem sin emitir evento:
  // al entrar al tab el badge se resetea (el socket lo vuelve a subir si
  // llega una nueva).
  useEffect(() => {
    if (pathname.startsWith("/notificaciones")) setUnread(0);
  }, [pathname]);

  // Al navegar la hoja "Más" se cierra.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const badge = unread != null && unread > 0 ? unread : 0;

  // Gating por rol — mismo criterio que HomeHub (ADMIN ve todo).
  const roles = new Set(me?.roles ?? []);
  const isStaff = roles.has("STAFF") || roles.has("ADMIN");
  const isProducer = roles.has("PRODUCER") || roles.has("ADMIN");
  const isAcademy =
    roles.has("ACADEMY_OWNER") || roles.has("INSTRUCTOR") || roles.has("ADMIN");
  const isAdmin = roles.has("ADMIN");

  const sheetItem = (
    href: string,
    key: MoreItemKey,
    path: string,
  ): MoreSheetItem => {
    const active = pathname.startsWith(href);
    return { href, label: t(key), icon: icon(path)(active), active };
  };

  // Sin sesión la hoja muestra solo Perfil; con sesión se agregan los
  // módulos de consumo y, según rol, los de gestión.
  const moreItems: MoreSheetItem[] = [
    sheetItem("/perfil", "profile", ICONS.profile),
    ...(me
      ? [
          sheetItem("/qr", "qr", ICONS.qr),
          sheetItem("/bailes", "dances", ICONS.dances),
          sheetItem("/entradas", "tickets", ICONS.tickets),
          sheetItem("/practicas", "practices", ICONS.practices),
          sheetItem("/viajes", "trips", ICONS.trips),
          ...(isStaff ? [sheetItem("/staff", "staff", ICONS.staff)] : []),
          ...(isProducer
            ? [
                sheetItem("/productor", "producer", ICONS.producer),
                sheetItem("/crm", "crm", ICONS.crm),
              ]
            : []),
          ...(isAcademy
            ? [sheetItem("/academia", "academy", ICONS.academy)]
            : []),
          ...(isAdmin ? [sheetItem("/admin", "admin", ICONS.admin)] : []),
        ]
      : []),
  ];

  // El tab "Más" se marca activo si la hoja está abierta o si la ruta
  // actual pertenece a un ítem de la hoja.
  const moreRouteActive = moreItems.some((i) => i.active);
  const moreActive = moreOpen || moreRouteActive;

  return (
    <>
      <nav
        aria-label={t("main")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-night-700 bg-night-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-between">
          {TABS.map((tab) => {
            const active = pathname.startsWith(tab.href);
            const isNotifications = tab.key === "notifications";
            const showBadge = isNotifications && badge > 0;
            return (
              <li key={tab.key} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    isNotifications
                      ? showBadge
                        ? t("notificationsUnread", { count: badge })
                        : t("notificationsFull")
                      : undefined
                  }
                  className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors active:scale-95 ${
                    tab.center
                      ? "text-neon"
                      : active
                        ? "text-neon"
                        : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {isNotifications ? (
                    <span className="relative">
                      {tab.icon(active)}
                      {showBadge && (
                        <span
                          aria-hidden
                          className="absolute -right-2.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[9px] font-bold leading-none text-night-950"
                        >
                          {badgeText(badge)}
                        </span>
                      )}
                    </span>
                  ) : tab.center ? (
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                        active
                          ? "border-neon bg-neon text-night-950"
                          : "border-neon/50 bg-neon/10 text-neon"
                      }`}
                    >
                      {tab.icon(true)}
                    </span>
                  ) : (
                    tab.icon(active)
                  )}
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-controls="nav-more-sheet"
              aria-current={moreRouteActive ? "page" : undefined}
              onClick={() => setMoreOpen((o) => !o)}
              className={`flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors active:scale-95 ${
                moreActive ? "text-neon" : "text-white/50 hover:text-white/80"
              }`}
            >
              {icon(ICONS.more)(moreActive)}
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        items={moreItems}
      />
    </>
  );
}
