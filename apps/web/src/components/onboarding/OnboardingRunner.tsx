"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { apiFetch } from "@/lib/api";

export type TourStep = {
  /** Selector CSS — normalmente "[data-tour='x']". Si no existe en el
      DOM el step se omite (contenido variable, p.ej. lista vacía). */
  element: string;
  title: string;
  description: string;
  side?: "top" | "bottom" | "left" | "right";
};

type MeOnboarding = { onboarding?: Record<string, string> };

/**
 * Tour de primera visita por superficie (driver.js). Lee /me una vez:
 * si `onboarding[tour]` falta y hay targets en el DOM, corre el tour;
 * al cerrarse (fin, skip o navegar) marca la clave en POST
 * /me/onboarding — queda visto para siempre en la DB del usuario.
 */
export function OnboardingRunner({
  tour,
  steps,
}: {
  tour: string;
  steps: TourStep[];
}) {
  const t = useTranslations("tours");

  useEffect(() => {
    let cancelled = false;
    let instance: ReturnType<typeof driver> | undefined;

    const markDone = () => {
      void apiFetch("/me/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tour }),
      }).catch(() => {});
    };

    apiFetch("/me")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const me = (await res.json()) as MeOnboarding;
        if (me.onboarding?.[tour] || cancelled) return;

        // Solo steps cuyo target existe — contenido variable no rompe
        // el tour (p.ej. primera card de eventos si la lista está vacía).
        const valid: DriveStep[] = steps
          .filter((s) => document.querySelector(s.element))
          .map((s) => ({
            element: s.element,
            popover: {
              title: s.title,
              description: s.description,
              side: s.side,
            },
          }));
        if (valid.length === 0) return;

        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

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
          // los reemplaza driver.js — por ICU quedarían como {current}.
          progressText: "{{current}} de {{total}}",
          onDestroyed: markDone,
        });
        instance.drive();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      // Si el usuario navega con el tour abierto, igual queda visto —
      // destruir gatilla onDestroyed → POST. Así no reaparece a medias.
      if (instance?.isActive()) instance.destroy();
    };
    // steps/t se consideran estables por página — el tour corre una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour]);

  return null;
}
