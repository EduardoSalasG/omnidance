"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MyQr } from "@/components/qr/MyQr";
import { DanceScanner } from "@/components/qr/DanceScanner";
import {
  OnboardingRunner,
  type TourStep,
} from "@/components/onboarding/OnboardingRunner";

// Hub de superficies QR: "Mi QR" (mostrar) y "Escanear" (invitar) en una
// sola vista con segmented control. ?modo=escanear o ?event= abren en
// escáner; sin params se recuerda la última elección (localStorage).
// La URL no cambia al alternar — así ?event= sigue vivo y el back no rompe.
type Mode = "mio" | "escanear";
const STORAGE_KEY = "omnidance:qr-mode";

function readStoredMode(): Mode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "escanear"
      ? "escanear"
      : "mio";
  } catch {
    return "mio";
  }
}

function persistMode(mode: Mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // storage lleno/bloqueado — la vista igual funciona
  }
}

function QrHub() {
  const tNav = useTranslations("nav");
  const tQr = useTranslations("qr");
  const tStaff = useTranslations("staff");
  const tt = useTranslations("tours.qr");
  const params = useSearchParams();
  const eventId = params.get("event") ?? undefined;
  const modoParam = params.get("modo");

  // null = aún no resuelto (solo cuando no hay param y falta leer storage).
  const [mode, setMode] = useState<Mode | null>(() =>
    eventId || modoParam === "escanear"
      ? "escanear"
      : modoParam === "mio"
        ? "mio"
        : null,
  );

  // Resolución de modo: params mandan (?event= implica escanear); sin params
  // se usa la última elección persistida. Se re-resuelve si cambian los
  // params (p.ej. el picker navega a /qr?modo=escanear&event=…).
  useEffect(() => {
    const resolved: Mode =
      eventId || modoParam === "escanear"
        ? "escanear"
        : modoParam === "mio"
          ? "mio"
          : readStoredMode();
    setMode(resolved);
    persistMode(resolved);
  }, [eventId, modoParam]);

  const select = (next: Mode) => {
    setMode(next);
    persistMode(next);
  };

  const options: { value: Mode; label: string }[] = [
    // nav.scan es el label del tab central ("QR"); el segmento dice
    // "Escanear" vía staff.scan — mismo significado, contexto distinto.
    { value: "mio", label: tNav("qr") },
    { value: "escanear", label: tStaff("scan") },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-6 sm:px-6">
      <header className="flex flex-col gap-4">
        {/* sr-only: el h1 visible es el large title del chrome; este span
            conserva el accessible name del radiogroup y el modo activo. */}
        <span id="qr-hub-title" className="sr-only">
          {mode === "escanear" ? tStaff("scan") : tQr("title")}
        </span>

        {/* Segmented control — radiogroup nativo: un solo tab stop, flechas
            cambian de opción gratis (patrón APG más simple para switch de
            vista mutuamente excluyente). Indicador deslizante solo con
            transform; reduced-motion lo vuelve instantáneo. */}
        <div
          role="radiogroup"
          aria-labelledby="qr-hub-title"
          data-tour="qr-mode"
          className="relative grid grid-cols-2 rounded-full border border-night-700 bg-night-800 p-1"
        >
          <span
            aria-hidden
            className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-neon transition-transform duration-200 ease-out motion-reduce:transition-none ${
              mode === "escanear" ? "translate-x-full" : "translate-x-0"
            } ${mode == null ? "opacity-0" : "opacity-100"}`}
          />
          {options.map((opt) => (
            <label key={opt.value} className="relative cursor-pointer">
              <input
                type="radio"
                name="qr-mode"
                value={opt.value}
                checked={mode === opt.value}
                onChange={() => select(opt.value)}
                className="peer sr-only"
              />
              <span
                className={`flex min-h-11 select-none items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white active:scale-[0.98] active:transition-transform motion-reduce:active:scale-100 ${
                  mode === opt.value ? "text-night-950" : "text-white/70"
                }`}
              >
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </header>

      <section className="mt-4 flex flex-1 flex-col">
        {mode === "escanear" ? (
          <DanceScanner eventId={eventId} />
        ) : mode === "mio" ? (
          <div data-tour="qr-code">
            <MyQr />
          </div>
        ) : null}
      </section>

      {mode === "mio" && (
        <OnboardingRunner
          tour="qr"
          steps={
            [
              {
                element: "[data-tour='qr-code']",
                title: tt("s1.title"),
                description: tt("s1.desc"),
                side: "top",
              },
              {
                element: "[data-tour='qr-mode']",
                title: tt("s2.title"),
                description: tt("s2.desc"),
                side: "bottom",
              },
            ] satisfies TourStep[]
          }
        />
      )}
    </main>
  );
}

export default function QrPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-night-950" aria-hidden="true" />}
    >
      <QrHub />
    </Suspense>
  );
}
