"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";

export type TourStep = {
  /** Selector CSS - normalmente "[data-tour='x']". Si no existe en el
      DOM el step se omite (contenido variable, p.ej. lista vacía). */
  element: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Tour de primera visita por superficie (driver.js). Lee el /me
 * compartido (MeProvider): si `onboarding[tour]` falta y hay targets en
 * el DOM, corre el tour; al cerrarse (fin, skip o navegar) marca la
 * clave en POST /me/onboarding y refresca el contexto - queda visto
 * para siempre y no reaparece al cambiar de página en la misma sesión.
 */
export function OnboardingRunner({
  tour,
  steps,
}: {
  tour: string;
  steps: TourStep[];
}) {
  const t = useTranslations("tours");
  const { me, loading: meLoading, refresh: refreshMe } = useMe();

  useEffect(() => {
    // Espera a que /me resuelva - sin sesión o tour ya visto → nada.
    if (meLoading || !me || me.onboarding?.[tour]) return;

    let instance: ReturnType<typeof driver> | undefined;

    const markDone = () => {
      void apiFetch("/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tour }),
      })
        .then(() => refreshMe())
        .catch(() => {});
    };

    // Solo steps cuyo target existe Y es visible - contenido variable
    // no rompe el tour (p.ej. primera card vacía), y en desktop (≥lg)
    // los targets del chrome móvil (tab bar, drawer) están con
    // display:none: getClientRects()=0 los excluye sin JS de breakpoint.
    const resolveSteps = (): DriveStep[] =>
      steps
        .filter((s) => {
          const el = document.querySelector(s.element);
          return (
            el instanceof HTMLElement && el.getClientRects().length > 0
          );
        })
        .map((s) => ({
          element: s.element,
          popover: {
            title: s.title,
            description: s.description,
            side: s.side,
          },
        }));

    // Los targets pueden montar detrás de un fetch (gate → dashboard):
    // resolverlos una sola vez al llegar /me dejaba el tour reducido al
    // chrome. Se sondea hasta que el set de targets quede estable ~1s
    // (contenido async ya montó) o se agote la espera; con 0 → no tour.
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const start = (valid: DriveStep[]) => {
      instance = driver({
        steps: valid,
        showProgress: true,
        animate: !reduceMotion,
        smoothScroll: !reduceMotion,
        overlayColor: "rgba(6, 6, 12, 0.78)",
        popoverClass: "omnidance-tour",
        nextBtnText: t("next"),
        prevBtnText: t("prev"),
        doneBtnText: t("done"),
        // Va como literal, no por catálogo: los {{current}}/{{total}}
        // los reemplaza driver.js - por ICU quedarían como {current}.
        progressText: "{{current}} de {{total}}",
        onDestroyed: markDone,
      });
      instance.drive();
    };

    const POLL_MS = 250;
    const STABLE_POLLS = 6;
    const MAX_WAIT_MS = 8000;
    let elapsed = 0;
    let stable = 0;
    let lastKey = "";
    let lastValid: DriveStep[] = [];

    const poll = setInterval(() => {
      elapsed += POLL_MS;
      const valid = resolveSteps();
      const key = valid.map((s) => String(s.element)).join("|");
      if (valid.length > 0 && key === lastKey) stable += 1;
      else stable = 0;
      lastKey = key;
      lastValid = valid;
      if (stable >= STABLE_POLLS || elapsed >= MAX_WAIT_MS) {
        clearInterval(poll);
        if (lastValid.length > 0) start(lastValid);
      }
    }, POLL_MS);

    return () => {
      clearInterval(poll);
      // Si el usuario navega con el tour abierto, igual queda visto -
      // destruir gatilla onDestroyed → POST. Así no reaparece a medias.
      if (instance?.isActive()) instance.destroy();
    };
    // steps/t se consideran estables por página - el tour corre una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour, meLoading, me]);

  return null;
}
