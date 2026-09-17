"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

// Tab bar inferior — el pulgar manda en la pista. Se oculta en contextos
// de pantalla completa (escáneres, login) donde estorba.
const HIDDEN_PREFIXES = ["/escanear", "/staff/", "/login"];

type Tab = {
  href: string;
  key: "home" | "events" | "dances" | "scan" | "tickets" | "profile";
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
  tickets: "M2 9a3 3 0 0 1 0 6v3a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-3a3 3 0 0 1 0-6V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1zm13-5v2m0 10v2m0-8v2",
  profile: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};

const TABS: Tab[] = [
  { href: "/", key: "home", icon: icon(ICONS.home) },
  { href: "/eventos", key: "events", icon: icon(ICONS.events) },
  { href: "/escanear", key: "scan", icon: icon(ICONS.scan), center: true },
  { href: "/bailes", key: "dances", icon: icon(ICONS.dances) },
  { href: "/entradas", key: "tickets", icon: icon(ICONS.tickets) },
  { href: "/perfil", key: "profile", icon: icon(ICONS.profile) },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav
      aria-label={t("main")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-night-700 bg-night-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex h-16 max-w-lg items-stretch justify-between">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
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
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
