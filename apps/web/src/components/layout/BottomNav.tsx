"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useActiveRole, type AppRole } from "@/lib/active-role";
import { useViewMode } from "@/lib/view-mode";
import { SideDrawer, type DrawerGroup } from "./SideDrawer";
import { ModeToggle } from "./ModeToggle";

// Chrome de app: hamburguesa flotante (→ drawer lateral con los módulos
// del rol agrupados por dominio) + large title iOS con la sección activa
// + tab bar inferior con las funciones primarias del rol y Perfil como
// quinto slot. Todo se oculta en contextos de pantalla completa
// (consola staff de puerta). Login vive en (marketing) sin este chrome.
// /qr sí muestra el nav — el escáner ocupa el área de contenido.
export const CHROME_HIDDEN_PREFIXES = ["/staff/"];

// Re-emisión DOM del socket — ver RealtimeProvider (notification → CustomEvent).
const NOTIFICATION_EVENT = "omnidance:notification";

type Me = { id: string; name: string; roles: string[] };

// key = clave nav.* del label; "create" es especial: su label viene del
// namespace producer (producer.createEvent), no de nav.
type TabKey =
  | "home"
  | "events"
  | "scan"
  | "staff"
  | "academy"
  | "admin"
  | "crm"
  | "profile"
  | "create"
  | "academies"
  | "friends"
  | "classes"
  | "tickets"
  | "practices"
  | "payouts"
  | "attendance"
  | "analytics"
  | "venue"
  | "dj"
  | "support";

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
  qr: "M3 3h6v6H3zM15 3h6v6H3zM3 15h6v6H3zM15 15h.01M18 15h.01M21 15h.01M15 18h.01M18 18h.01M21 18h.01M15 21h.01M18 21h.01M21 21h.01",
  practices:
    "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0zM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  trips:
    "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
  staff:
    "M8 2h8a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m3 10 2 2 4-4",
  producer: "m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6",
  crm: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  academy:
    "M22 10 12 5 2 10l10 5 10-5zM6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5M22 10v6",
  admin:
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1zm-11 7 2 2 4-4",
  // Plus — tab central "crear" del productor.
  plus: "M12 5v14M5 12h14",
  // Listados/fichas genéricos para el drawer.
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  tag: "M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l8.58-8.58a1 1 0 0 0 0-1.42zM7 7h.01",
  card: "M2 8.5h20M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 10h4",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm0-14v6l4 2",
  play: "M5 3l14 9-14 9z",
  slider:
    "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  // Pin de mapa — consola del venue.
  pin: "M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11zM12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  // Nota musical — consola del DJ.
  music:
    "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  // Audífonos — consola de soporte.
  headset:
    "M4 13a8 8 0 0 1 16 0M4 13v4a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H4zM20 13v4a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3z",
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
const PROFILE_TAB: Tab = {
  href: "/perfil",
  key: "profile",
  icon: icon(ICONS.profile),
};
const ACADEMIAS_TAB: Tab = {
  href: "/academias",
  key: "academies",
  icon: icon(ICONS.academy),
};
const CLASSES_TAB: Tab = {
  href: "/clases",
  key: "classes",
  icon: icon(ICONS.clock),
};
const TICKETS_TAB: Tab = {
  href: "/entradas",
  key: "tickets",
  icon: icon(ICONS.tickets),
};
const PAYOUTS_TAB: Tab = {
  href: "/productor/pagos",
  key: "payouts",
  icon: icon(ICONS.card),
};
const ATTENDANCE_TAB: Tab = {
  href: "/academia/asistencia",
  key: "attendance",
  icon: icon(ICONS.staff),
};
const ANALYTICS_TAB: Tab = {
  href: "/analitica",
  key: "analytics",
  icon: icon(ICONS.slider),
};
const VENUE_TAB: Tab = {
  href: "/venue",
  key: "venue",
  icon: icon(ICONS.pin),
  center: true,
};
const DJ_TAB: Tab = {
  href: "/dj",
  key: "dj",
  icon: icon(ICONS.music),
  center: true,
};
const SUPPORT_TAB: Tab = {
  href: "/soporte",
  key: "support",
  icon: icon(ICONS.headset),
  center: true,
};

// DANCER en modo Academia: Eventos se reemplaza por el directorio de
// academias y Clases (explorar + mis reservas) es tab propio. QR se
// mantiene — sirve para check-in de clases igual que en puerta.
// Prácticas queda en el drawer (máximo 5 ítems en el bottom bar).
const DANCER_ACADEMY_TABS: Tab[] = [
  HOME_TAB,
  ACADEMIAS_TAB,
  CLASSES_TAB,
  QR_TAB,
];

// Tabs por rol activo — máximo 4 slots funcionales + Perfil = 5 ítems
// (el tope visual del bottom bar). Las notificaciones viven en el
// appbar (campana con badge), no en el bottom nav: los slots que
// liberan los ocupa la función más usada de cada rol.
const TABS_BY_ROLE: Record<AppRole, Tab[]> = {
  DANCER: [HOME_TAB, EVENTS_TAB, QR_TAB, TICKETS_TAB],
  STAFF: [
    HOME_TAB,
    { href: "/staff", key: "staff", icon: icon(ICONS.staff) },
    QR_TAB,
    EVENTS_TAB,
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
    PAYOUTS_TAB,
  ],
  ACADEMY_OWNER: [
    HOME_TAB,
    {
      href: "/academia",
      key: "academy",
      icon: icon(ICONS.academy),
      center: true,
    },
    ATTENDANCE_TAB,
  ],
  INSTRUCTOR: [
    HOME_TAB,
    {
      href: "/academia",
      key: "academy",
      icon: icon(ICONS.academy),
      center: true,
    },
    ATTENDANCE_TAB,
  ],
  DJ: [HOME_TAB, DJ_TAB, EVENTS_TAB, QR_TAB],
  VENUE_MANAGER: [HOME_TAB, VENUE_TAB, EVENTS_TAB, ANALYTICS_TAB],
  SUPPORT: [HOME_TAB, SUPPORT_TAB, EVENTS_TAB],
  ADMIN: [
    HOME_TAB,
    { href: "/admin", key: "admin", icon: icon(ICONS.admin), center: true },
    { href: "/crm", key: "crm", icon: icon(ICONS.crm) },
    ANALYTICS_TAB,
  ],
};

// Drawer lateral — el resto de los módulos del rol, agrupados por dominio.
// ns = namespace i18n del label; las sub-secciones de consola reusan las
// claves modules.* de cada dominio.
type DrawerSpec = {
  href: string;
  ns:
    | "nav"
    | "producer"
    | "academy"
    | "admin"
    | "events"
    | "friends"
    | "classes"
    | "academySeries"
    | "adminCatalogs"
    | "producerParams"
    | "analytics";
  key: string;
  icon: string;
};

type DrawerGroupSpec = {
  // clave i18n de nav.* para el header del grupo
  labelNs: "nav" | "producer" | "academy" | "admin";
  labelKey: string;
  items: DrawerSpec[];
};

const DRAWER_BY_ROLE: Record<AppRole, DrawerGroupSpec[]> = {
  DANCER: [
    {
      labelNs: "nav",
      labelKey: "socialSection",
      items: [
        { href: "/amigos", ns: "nav", key: "friends", icon: ICONS.users },
        { href: "/bailes", ns: "nav", key: "dances", icon: ICONS.dances },
        {
          href: "/practicas",
          ns: "nav",
          key: "practices",
          icon: ICONS.practices,
        },
        { href: "/viajes", ns: "nav", key: "trips", icon: ICONS.trips },
      ],
    },
  ],
  STAFF: [
    {
      labelNs: "nav",
      labelKey: "socialSection",
      items: [
        { href: "/eventos", ns: "events", key: "title", icon: ICONS.events },
      ],
    },
  ],
  PRODUCER: [
    {
      labelNs: "producer",
      labelKey: "title",
      items: [
        {
          href: "/productor",
          ns: "producer",
          key: "title",
          icon: ICONS.producer,
        },
        {
          href: "/productor/codigos",
          ns: "producer",
          key: "modules.codes",
          icon: ICONS.tag,
        },
        {
          href: "/productor/listas",
          ns: "producer",
          key: "modules.lists",
          icon: ICONS.list,
        },
        {
          href: "/productor/pagos",
          ns: "producer",
          key: "payouts",
          icon: ICONS.card,
        },
        {
          href: "/productor/parametros",
          ns: "producerParams",
          key: "title",
          icon: ICONS.slider,
        },
        {
          href: "/analitica",
          ns: "analytics",
          key: "title",
          icon: ICONS.slider,
        },
        { href: "/crm", ns: "nav", key: "crm", icon: ICONS.crm },
      ],
    },
    {
      labelNs: "nav",
      labelKey: "socialSection",
      items: [
        { href: "/eventos", ns: "events", key: "title", icon: ICONS.events },
      ],
    },
  ],
  ACADEMY_OWNER: [
    {
      labelNs: "academy",
      labelKey: "title",
      items: [
        {
          href: "/academia/planes",
          ns: "academy",
          key: "modules.plans",
          icon: ICONS.card,
        },
        {
          href: "/academia/alumnos",
          ns: "academy",
          key: "modules.students",
          icon: ICONS.users,
        },
        {
          href: "/academia/horarios",
          ns: "academy",
          key: "modules.slots",
          icon: ICONS.clock,
        },
        {
          href: "/academia/series",
          ns: "academySeries",
          key: "title",
          icon: ICONS.events,
        },
        {
          href: "/academia/asistencia",
          ns: "academy",
          key: "modules.attendance",
          icon: ICONS.staff,
        },
        {
          href: "/academia/particulares",
          ns: "academy",
          key: "modules.lessons",
          icon: ICONS.dances,
        },
        {
          href: "/academia/videos",
          ns: "academy",
          key: "modules.videos",
          icon: ICONS.play,
        },
        {
          href: "/analitica",
          ns: "analytics",
          key: "title",
          icon: ICONS.slider,
        },
      ],
    },
  ],
  INSTRUCTOR: [
    {
      labelNs: "academy",
      labelKey: "title",
      items: [
        {
          href: "/academia/alumnos",
          ns: "academy",
          key: "modules.students",
          icon: ICONS.users,
        },
        {
          href: "/academia/horarios",
          ns: "academy",
          key: "modules.slots",
          icon: ICONS.clock,
        },
        {
          href: "/academia/asistencia",
          ns: "academy",
          key: "modules.attendance",
          icon: ICONS.staff,
        },
        {
          href: "/academia/particulares",
          ns: "academy",
          key: "modules.lessons",
          icon: ICONS.dances,
        },
        {
          href: "/academia/videos",
          ns: "academy",
          key: "modules.videos",
          icon: ICONS.play,
        },
      ],
    },
  ],
  // El DJ también es parte de la escena: su consola es tab central y el
  // drawer le deja lo social (amigos, bailes, prácticas).
  DJ: [
    {
      labelNs: "nav",
      labelKey: "socialSection",
      items: [
        { href: "/amigos", ns: "nav", key: "friends", icon: ICONS.users },
        { href: "/bailes", ns: "nav", key: "dances", icon: ICONS.dances },
        {
          href: "/practicas",
          ns: "nav",
          key: "practices",
          icon: ICONS.practices,
        },
      ],
    },
  ],
  SUPPORT: [],
  VENUE_MANAGER: [
    {
      labelNs: "nav",
      labelKey: "consoleSection",
      items: [
        {
          href: "/analitica",
          ns: "analytics",
          key: "title",
          icon: ICONS.slider,
        },
      ],
    },
  ],
  ADMIN: [
    {
      labelNs: "admin",
      labelKey: "title",
      items: [
        {
          href: "/admin/solicitudes",
          ns: "admin",
          key: "modules.requests",
          icon: ICONS.users,
        },
        {
          href: "/admin/roles",
          ns: "admin",
          key: "modules.roles",
          icon: ICONS.admin,
        },
        {
          href: "/admin/parametros",
          ns: "admin",
          key: "modules.params",
          icon: ICONS.slider,
        },
        {
          href: "/admin/usuarios",
          ns: "admin",
          key: "modules.users",
          icon: ICONS.users,
        },
        {
          href: "/admin/auditoria",
          ns: "admin",
          key: "modules.audit",
          icon: ICONS.list,
        },
        {
          href: "/admin/catalogos",
          ns: "adminCatalogs",
          key: "title",
          icon: ICONS.tag,
        },
        {
          href: "/analitica",
          ns: "analytics",
          key: "title",
          icon: ICONS.slider,
        },
      ],
    },
    {
      labelNs: "nav",
      labelKey: "socialSection",
      items: [
        { href: "/eventos", ns: "events", key: "title", icon: ICONS.events },
        { href: "/staff", ns: "nav", key: "staff", icon: ICONS.staff },
      ],
    },
  ],
};

// Drawer del DANCER en modo Academia — el dominio nightlife (bailes,
// entradas, viajes) se reemplaza por el de aprendizaje. Prácticas queda
// en ambos: es el puente entre clase y pista.
const DANCER_ACADEMY_DRAWER: DrawerGroupSpec[] = [
  {
    labelNs: "academy",
    labelKey: "title",
    items: [
      { href: "/academia", ns: "academy", key: "title", icon: ICONS.academy },
      {
        href: "/practicas",
        ns: "nav",
        key: "practices",
        icon: ICONS.practices,
      },
      { href: "/academias", ns: "nav", key: "academies", icon: ICONS.academy },
    ],
  },
  // En modo Academia el social no desaparece: eventos y amigos siguen a
  // un toque en el drawer.
  {
    labelNs: "nav",
    labelKey: "socialSection",
    items: [
      { href: "/eventos", ns: "nav", key: "events", icon: ICONS.events },
      { href: "/amigos", ns: "nav", key: "friends", icon: ICONS.users },
    ],
  },
];

/** unreadCount acotado para el badge — 99+ como en el home hub. */
function badgeText(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  // Labels fuera de nav.*: "create" (producer.createEvent) e ítems del
  // drawer que reutilizan los namespaces de cada dominio.
  const tp = useTranslations("producer");
  const te = useTranslations("events");
  const tac = useTranslations("academy");
  const tad = useTranslations("admin");
  const tpr = useTranslations("profile");
  const nsT = {
    nav: t,
    producer: tp,
    events: te,
    academy: tac,
    admin: tad,
    friends: useTranslations("friends"),
    classes: useTranslations("classes"),
    academySeries: useTranslations("academySeries"),
    adminCatalogs: useTranslations("adminCatalogs"),
    producerParams: useTranslations("producerParams"),
    analytics: useTranslations("analytics"),
  } as const;
  // null = sin sesión (o fetch aún no responde con certeza) → sin badge.
  const [unread, setUnread] = useState<number | null>(null);
  // null = sin sesión → el drawer muestra solo Perfil.
  const [me, setMe] = useState<Me | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Lente activa — cambia cuando Perfil dispara setActiveRole.
  const activeRole = useActiveRole(me?.roles);
  // Modo consumer (solo aplica a DANCER): social ↔ academy.
  const viewMode = useViewMode();
  const dancerAcademy = activeRole === "DANCER" && viewMode === "academy";

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

  // Roles para filtrar los ítems del drawer — una sola vez, con el
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
  // al entrar el badge se resetea (el socket lo vuelve a subir si llega
  // una nueva).
  useEffect(() => {
    if (pathname.startsWith("/notificaciones")) setUnread(0);
  }, [pathname]);

  // Al navegar el drawer se cierra.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (CHROME_HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)))
    return null;

  const badge = unread != null && unread > 0 ? unread : 0;

  const labelFor = (ns: DrawerSpec["ns"], key: string): string =>
    nsT[ns](key);

  const roleTabs = dancerAcademy
    ? DANCER_ACADEMY_TABS
    : TABS_BY_ROLE[activeRole];
  const roleDrawer = dancerAcademy
    ? DANCER_ACADEMY_DRAWER
    : DRAWER_BY_ROLE[activeRole];

  const tabHrefs = new Set(
    [...roleTabs, PROFILE_TAB].map((tab) => tab.href),
  );

  // Sin sesión el drawer muestra solo Perfil; con sesión, los grupos del
  // rol activo. Los hrefs que ya son tab no se marcan activos en el drawer.
  const drawerGroups: DrawerGroup[] = !me
    ? [
        {
          label: t("personal"),
          items: [
            {
              href: "/perfil",
              label: t("profile"),
              icon: icon(ICONS.profile)(false),
              active: false,
            },
          ],
        },
      ]
    : roleDrawer.map((g) => ({
        label: labelFor(g.labelNs, g.labelKey),
        items: g.items.map((spec) => ({
          href: spec.href,
          label: labelFor(spec.ns, spec.key),
          icon: icon(spec.icon)(
            !tabHrefs.has(spec.href) && pathname.startsWith(spec.href),
          ),
          active: !tabHrefs.has(spec.href) && pathname.startsWith(spec.href),
        })),
      }));

  const hasDrawerItems = drawerGroups.some((g) => g.items.length > 0);
  const roleLabel = tpr(`roleLabels.${activeRole}`);

  const allTabs = [...roleTabs, PROFILE_TAB];

  const tabLabel = (tab: Tab) =>
    tab.key === "create" ? tp("createEvent") : t(tab.key);

  // Título contextual junto a la hamburguesa: longest-prefix match sobre
  // tabs + ítems del drawer de todos los roles (solo resuelve el nombre
  // de la ruta actual — /admin/usuarios → "Usuarios", /eventos/1 →
  // "Eventos"). Sin match (p.ej. /checkout) no se muestra nada.
  const pageLabel = (() => {
    const entries: [string, string][] = [
      // /notificaciones ya no es tab: vive en la campana del appbar,
      // pero el título contextual sigue resolviendo la ruta.
      ["/notificaciones", t("notifications")],
      ...allTabs.map((tab) => [tab.href, tabLabel(tab)] as [string, string]),
      ...DANCER_ACADEMY_TABS.map(
        (tab) => [tab.href, tabLabel(tab)] as [string, string],
      ),
      ...Object.values(DRAWER_BY_ROLE).flatMap((groups) =>
        groups.flatMap((g) =>
          g.items.map(
            (it) => [it.href, labelFor(it.ns, it.key)] as [string, string],
          ),
        ),
      ),
      ...DANCER_ACADEMY_DRAWER.flatMap((g) =>
        g.items.map(
          (it) => [it.href, labelFor(it.ns, it.key)] as [string, string],
        ),
      ),
    ];
    entries.sort((a, b) => b[0].length - a[0].length);
    const hit = entries.find(
      ([href]) => pathname === href || pathname.startsWith(`${href}/`),
    );
    return hit?.[1] ?? null;
  })();

  const renderTab = (tab: Tab) => {
    // /inicio es match exacto (prefijo "/" marcaría todo); el resto
    // por prefijo — /productor/eventos solo se activa con ese
    // prefijo, no con /productor ni /productor/pagos.
    const active =
      tab.href === "/inicio"
        ? pathname === "/inicio"
        : pathname.startsWith(tab.href);
    return (
      <li key={tab.key} className="flex-1">
        <Link
          href={tab.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-medium transition-colors active:scale-95 ${
            tab.center
              ? "text-neon"
              : active
                ? "text-neon"
                : "text-white/50 hover:text-white/80"
          }`}
        >
          {tab.center ? (
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
          {tabLabel(tab)}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Hamburguesa flotante — solo si el rol tiene módulos en el drawer */}
      {hasDrawerItems && (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          aria-controls="app-side-drawer"
          aria-label={t("menu")}
          onClick={() => setDrawerOpen((o) => !o)}
          className="fixed left-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-night-700 bg-night-900/80 text-white/80 shadow-lg shadow-black/40 backdrop-blur transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="h-6 w-6"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Título de sección estilo nav bar iOS: h1 centrado a la misma
          altura que la hamburguesa — las páginas no repiten el título
          de sección (solo títulos de contenido: detalle de evento,
          estados de checkout). px-16 despeja el botón flotante.
          Excepción: en /inicio con lente DANCER el slot lo ocupa el
          switch Social/Academia; el h1 queda sr-only para no perder el
          encabezado de la página. */}
      {pathname === "/inicio" && activeRole === "DANCER" ? (
        <>
          {pageLabel && <h1 className="sr-only">{pageLabel}</h1>}
          <div className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-11 items-center px-16">
            <ModeToggle />
          </div>
        </>
      ) : (
        pageLabel && (
          <h1 className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-11 items-center justify-center truncate px-16 text-center text-lg font-semibold tracking-tight text-white">
            {pageLabel}
          </h1>
        )
      )}

      {/* Campana de notificaciones — appbar derecha, espejo de la
          hamburguesa. Mismo badge con tope 99+; el aria-label anuncia
          el conteo. Solo con sesión (un 401 deja me en null). */}
      {me && (
        <Link
          href="/notificaciones"
          aria-label={
            badge > 0
              ? t("notificationsUnread", { count: badge })
              : t("notificationsFull")
          }
          aria-current={
            pathname.startsWith("/notificaciones") ? "page" : undefined
          }
          className={`fixed right-3 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 flex h-11 w-11 items-center justify-center rounded-full border border-night-700 bg-night-900/80 shadow-lg shadow-black/40 backdrop-blur transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
            pathname.startsWith("/notificaciones")
              ? "text-neon"
              : "text-white/80 hover:text-white"
          }`}
        >
          <span className="relative">
            {icon(ICONS.notifications)(false)}
            {badge > 0 && (
              <span
                aria-hidden
                className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon px-1 text-[9px] font-bold leading-none text-night-950"
              >
                {badgeText(badge)}
              </span>
            )}
          </span>
        </Link>
      )}

      <nav
        aria-label={t("main")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-night-700 bg-night-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-between">
          {allTabs.map(renderTab)}
        </ul>
      </nav>

      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        groups={drawerGroups}
        roleLabel={me ? roleLabel : undefined}
      />
    </>
  );
}
