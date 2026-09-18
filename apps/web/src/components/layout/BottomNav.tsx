"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useActiveRole, type AppRole } from "@/lib/active-role";
import { MoreSheet, type MoreSheetItem } from "./MoreSheet";

// Tab bar inferior — el pulgar manda en la pista. Se oculta en contextos
// de pantalla completa (consola staff) donde estorba. Login ya no comparte
// layout: vive en (marketing) sin BottomNav. /qr sí muestra el nav — el
// escáner de invitación ocupa el área de contenido, no fullscreen.
// Los tabs dependen del rol activo (ver lib/active-role.ts): máximo 5
// slots, el último es siempre el botón "Más" que abre la hoja con el
// resto de secciones del rol.
const HIDDEN_PREFIXES = ["/staff/"];

// Re-emisión DOM del socket — ver RealtimeProvider (notification → CustomEvent).
const NOTIFICATION_EVENT = "omnidance:notification";

type Me = { id: string; name: string; roles: string[] };

// key = clave nav.* del label; "create" es especial: su label viene del
// namespace producer (producer.createEvent), no de nav.
type TabKey =
  | "home"
  | "events"
  | "scan"
  | "notifications"
  | "staff"
  | "academy"
  | "admin"
  | "crm"
  | "create";

type Tab = {
  href: string;
  key: TabKey;
  icon: (active: boolean) => React.ReactNode;
  center?: boolean;
};

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
  // Plus — tab central "crear" del productor.
  plus: "M12 5v14M5 12h14",
};

const HOME_TAB: Tab = { href: "/inicio", key: "home", icon: icon(ICONS.home) };
const EVENTS_TAB: Tab = {
  href: "/eventos",
  key: "events",
  icon: icon(ICONS.events),
};
const QR_TAB: Tab = {
  href: "/qr",
  key: "scan",
  icon: icon(ICONS.scan),
  center: true,
};
const NOTIFICATIONS_TAB: Tab = {
  href: "/notificaciones",
  key: "notifications",
  icon: icon(ICONS.notifications),
};

// Tabs por rol activo — sin el botón "Más", que siempre ocupa el quinto
// slot del nav aunque el rol tenga menos de 4 tabs. El tab central
// (center) del productor apunta a /productor/eventos, donde vive el
// formulario de creación inline.
const TABS_BY_ROLE: Record<AppRole, Tab[]> = {
  DANCER: [HOME_TAB, EVENTS_TAB, QR_TAB, NOTIFICATIONS_TAB],
  STAFF: [
    HOME_TAB,
    { href: "/staff", key: "staff", icon: icon(ICONS.staff) },
    QR_TAB,
    NOTIFICATIONS_TAB,
  ],
  PRODUCER: [
    HOME_TAB,
    { href: "/productor/eventos", key: "events", icon: icon(ICONS.events) },
    {
      href: "/productor/eventos?crear=1",
      key: "create",
      icon: icon(ICONS.plus),
      center: true,
    },
    NOTIFICATIONS_TAB,
  ],
  ACADEMY_OWNER: [
    HOME_TAB,
    {
      href: "/academia",
      key: "academy",
      icon: icon(ICONS.academy),
      center: true,
    },
    NOTIFICATIONS_TAB,
  ],
  INSTRUCTOR: [
    HOME_TAB,
    {
      href: "/academia",
      key: "academy",
      icon: icon(ICONS.academy),
      center: true,
    },
    NOTIFICATIONS_TAB,
  ],
  DJ: [HOME_TAB, EVENTS_TAB, NOTIFICATIONS_TAB],
  VENUE_MANAGER: [HOME_TAB, EVENTS_TAB, NOTIFICATIONS_TAB],
  ADMIN: [
    HOME_TAB,
    { href: "/admin", key: "admin", icon: icon(ICONS.admin), center: true },
    { href: "/crm", key: "crm", icon: icon(ICONS.crm) },
    NOTIFICATIONS_TAB,
  ],
};

// Spec de los ítems de la hoja "Más" por rol — cada rol ve solo sus
// funciones (el cambio de lente vive en Perfil). ns = namespace de la
// clave i18n del label.
type MoreSpec = {
  href: string;
  ns: "nav" | "producer" | "events";
  key: string;
  icon: string;
};

const PROFILE_ITEM: MoreSpec = {
  href: "/perfil",
  ns: "nav",
  key: "profile",
  icon: ICONS.profile,
};

const MORE_ITEMS_BY_ROLE: Record<AppRole, MoreSpec[]> = {
  DANCER: [
    { href: "/bailes", ns: "nav", key: "dances", icon: ICONS.dances },
    { href: "/entradas", ns: "nav", key: "tickets", icon: ICONS.tickets },
    {
      href: "/practicas",
      ns: "nav",
      key: "practices",
      icon: ICONS.practices,
    },
    { href: "/viajes", ns: "nav", key: "trips", icon: ICONS.trips },
    PROFILE_ITEM,
  ],
  STAFF: [PROFILE_ITEM],
  PRODUCER: [
    {
      href: "/productor/pagos",
      ns: "producer",
      key: "payouts",
      icon: ICONS.producer,
    },
    { href: "/crm", ns: "nav", key: "crm", icon: ICONS.crm },
    // Explorar el listado público de eventos — label events.title.
    { href: "/eventos", ns: "events", key: "title", icon: ICONS.events },
    PROFILE_ITEM,
  ],
  ACADEMY_OWNER: [PROFILE_ITEM],
  INSTRUCTOR: [PROFILE_ITEM],
  DJ: [PROFILE_ITEM],
  VENUE_MANAGER: [PROFILE_ITEM],
  ADMIN: [
    { href: "/eventos", ns: "events", key: "title", icon: ICONS.events },
    { href: "/staff", ns: "nav", key: "staff", icon: ICONS.staff },
    PROFILE_ITEM,
  ],
};

/** unreadCount acotado para el badge — 99+ como en el home hub. */
function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // Labels fuera de nav.*: "create" (producer.createEvent) e ítems de la
  // hoja que reutilizan producer.payouts / events.title.
  const tp = useTranslations("producer");
  const te = useTranslations("events");
  // null = sin sesión (o fetch aún no responde con certeza) → sin badge.
  const [unread, setUnread] = useState<number | null>(null);
  // null = sin sesión → la hoja "Más" muestra solo Perfil.
  const [me, setMe] = useState<Me | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  // Lente activa — cambia cuando Perfil dispara setActiveRole.
  const activeRole = useActiveRole(me?.roles);

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

  const tabs = TABS_BY_ROLE[activeRole];
  const tabHrefs = new Set(tabs.map((tab) => tab.href));

  const labelFor = (spec: MoreSpec): string =>
    spec.ns === "nav" ? t(spec.key) : spec.ns === "producer" ? tp(spec.key) : te(spec.key);

  const sheetItem = (
    href: string,
    label: string,
    path: string,
  ): MoreSheetItem => {
    // Si el href ya es un tab, gana el tab: el ítem de la hoja no marca
    // activo (evita que "Más" se ilumine por una ruta que tiene tab).
    const active = !tabHrefs.has(href) && pathname.startsWith(href);
    return { href, label, icon: icon(path)(active), active };
  };

  // Sin sesión la hoja muestra solo Perfil; con sesión, los ítems del rol
  // activo (cada lente ve solo sus funciones — el switch vive en Perfil).
  const moreItems: MoreSheetItem[] = !me
    ? [sheetItem("/perfil", t("profile"), ICONS.profile)]
    : MORE_ITEMS_BY_ROLE[activeRole].map((spec) =>
        sheetItem(spec.href, labelFor(spec), spec.icon),
      );

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
          {tabs.map((tab) => {
            // /inicio es match exacto (prefijo "/" marcaría todo); el resto
            // por prefijo — /productor/eventos solo se activa con ese
            // prefijo, no con /productor ni /productor/pagos.
            const active =
              tab.href === "/inicio"
                ? pathname === "/inicio"
                : pathname.startsWith(tab.href);
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
                  {tab.key === "create" ? tp("createEvent") : t(tab.key)}
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
