"use client";

import { useTranslations } from "next-intl";
import { useViewMode, setViewMode, type ViewMode } from "@/lib/view-mode";

// Switch Social/Academia del lens consumer — radiogroup nativo (mismo
// patrón APG del hub QR): un tab stop, flechas cambian opción, indicador
// deslizante con transform puro y reduced-motion instantáneo. Vive en
// la fila del chrome (en vez del título) cuando el bailarín está en
// /inicio.
export function ModeToggle() {
  const t = useTranslations("home");
  const mode = useViewMode();
  const options: { value: ViewMode; label: string }[] = [
    { value: "social", label: t("modeSocial") },
    { value: "academy", label: t("modeAcademy") },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t("modeLabel")}
      className="relative grid w-full grid-cols-2 rounded-full border border-night-700 bg-night-800 p-1"
    >
      <span
        aria-hidden
        className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-neon transition-transform duration-200 ease-out motion-reduce:transition-none ${
          mode === "academy" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {options.map((opt) => (
        <label key={opt.value} className="relative z-10 cursor-pointer">
          <input
            type="radio"
            name="view-mode"
            value={opt.value}
            checked={mode === opt.value}
            onChange={() => setViewMode(opt.value)}
            className="peer sr-only"
          />
          <span
            className={`flex min-h-8 items-center justify-center rounded-full text-sm font-medium transition-colors peer-checked:text-night-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-neon ${
              mode === opt.value ? "font-semibold" : "text-white/60"
            }`}
          >
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}
