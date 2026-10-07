"use client";

import { useTranslations } from "next-intl";
import {
  setThemePref,
  useThemePref,
  type ThemePref,
} from "@/lib/theme";

const ORDER: ThemePref[] = ["system", "light", "dark"];

// Íconos por preferencia - mismo lenguaje que los ICONS de BottomNav
// (viewBox 24, stroke currentColor, caps redondos).
function ThemeIcon({ pref }: { pref: ThemePref }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {pref === "system" ? (
        <>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </>
      ) : pref === "light" ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" />
      )}
    </svg>
  );
}

/**
 * Selector de tema: Sistema (sigue prefers-color-scheme del equipo),
 * Claro u Oscuro. Radiogroup nativo por teclado; la preferencia persiste
 * en localStorage y se aplica al instante vía lib/theme.
 *
 * Variantes:
 * - "segmented": control de 3 opciones ícono+label (drawer móvil,
 *   sidebar expandida, footers públicos).
 * - "compact": botón único que cicla system→light→dark con el ícono de
 *   la preferencia actual (riel colapsado de la sidebar, w-16).
 */
export function ThemeToggle({
  variant = "segmented",
}: {
  variant?: "segmented" | "compact";
}) {
  const t = useTranslations("nav");
  const pref = useThemePref();
  const labels: Record<ThemePref, string> = {
    system: t("themeSystem"),
    light: t("themeLight"),
    dark: t("themeDark"),
  };

  if (variant === "compact") {
    const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    const label = `${t("theme")}: ${labels[pref]}`;
    return (
      <button
        type="button"
        onClick={() => setThemePref(next)}
        aria-label={label}
        title={label}
        className="flex min-h-11 w-full items-center justify-center rounded-xl text-ink/70 transition-colors hover:bg-elevated hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon active:scale-[0.98]"
      >
        <ThemeIcon pref={pref} />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("theme")}
      className="flex rounded-xl border border-line p-1"
    >
      {ORDER.map((opt) => (
        <button
          key={opt}
          type="button"
          role="radio"
          aria-checked={pref === opt}
          onClick={() => setThemePref(opt)}
          className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
            pref === opt
              ? "bg-elevated text-neon"
              : "text-ink/60 hover:text-ink"
          }`}
        >
          <ThemeIcon pref={opt} />
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}
