"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { StarIcon } from "@/components/ui";

export type StarRatingProps = {
  /** Puntaje ya registrado. Si no hay onSelect, se muestra solo lectura. */
  value?: number | null;
  onSelect?: (score: number) => void;
  busy?: boolean;
  /** aria-label del radiogroup/img - default "¿Cómo estuvo el baile?"
      (sesiones); la encuesta de evento pasa el nombre de la dimensión. */
  ariaLabel?: string;
  /** Campo obligatorio - aria-required en el radiogroup. */
  required?: boolean;
  /** Submit falló por falta de selección - aria-invalid en el grupo. */
  invalid?: boolean;
  /** id del mensaje que describe el estado del grupo (p.ej. el error
      de "obligatorio") - va a aria-describedby del radiogroup. */
  ariaDescribedBy?: string;
};

const STARS = [1, 2, 3, 4, 5] as const;
const LAST = STARS[STARS.length - 1];

const starCls = (lit: boolean) =>
  `flex min-h-11 min-w-11 items-center justify-center text-3xl transition-transform active:scale-90 ${
    lit ? "text-neon" : "text-white/40"
  }`;

/** Cinco estrellas con touch targets >= 44px - usable con pulgar en pista. */
export function StarRating({
  value = null,
  onSelect,
  busy = false,
  ariaLabel,
  required = false,
  invalid = false,
  ariaDescribedBy,
}: StarRatingProps) {
  const t = useTranslations("sessions");
  const [preview, setPreview] = useState<number | null>(null);
  // Última estrella pedida en esta interacción - el padre confirma async,
  // así aria-checked refleja la elección del usuario de inmediato.
  const [chosen, setChosen] = useState<number | null>(null);
  // Roving tabindex (APG radiogroup): solo una estrella es tabbable.
  // También marca la posición de navegación por teclado: las flechas
  // la mueven SIN confirmar - Enter/Espacio sobre la estrella enfocada
  // confirma (el click nativo del botón dispara select). Un tap/click
  // directo sigue enviando al instante.
  const [focusStar, setFocusStar] = useState<number | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const interactive = Boolean(onSelect) && !busy;
  const active = preview ?? focusStar ?? value ?? chosen ?? 0;
  const checked = value ?? chosen ?? 0;
  // aria-checked muestra la posición navegada (preview) mientras el
  // foco está en el grupo; sin foco, el valor comprometido.
  const announced = focusStar ?? checked;

  // Modo display (sin onSelect): imagen informativa, sin roles interactivos.
  if (!onSelect) {
    return (
      <div
        className="flex items-center"
        role="img"
        aria-label={
          ariaLabel
            ? `${ariaLabel}: ${t("rating", { value: value ?? 0 })}`
            : t("rating", { value: value ?? 0 })
        }
      >
        {STARS.map((star) => (
          <span key={star} aria-hidden="true" className={starCls(star <= active)}>
            <StarIcon filled={star <= active} className="h-7 w-7" />
          </span>
        ))}
      </div>
    );
  }

  // Si aún no hay selección, la primera estrella recibe el tab.
  const tabbable = focusStar ?? (checked > 0 ? checked : 1);

  function select(star: number) {
    if (!interactive) return;
    setChosen(star);
    onSelect?.(star);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, star: number) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : e.key === "Home"
            ? 1 - star
            : e.key === "End"
              ? LAST - star
              : 0;
    if (delta === 0) return;
    e.preventDefault();
    const next = Math.min(LAST, Math.max(1, star + delta));
    // Navegar ≠ enviar: la flecha mueve el foco (roving tabindex +
    // preview aria-checked); la selección se confirma con
    // Enter/Espacio, que el botón traduce a click → select().
    setFocusStar(next);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next - 1]?.focus();
  }

  return (
    <div
      ref={groupRef}
      className="flex items-center"
      role="radiogroup"
      aria-label={ariaLabel ?? t("ratePrompt")}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
    >
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === announced}
          tabIndex={star === tabbable ? 0 : -1}
          disabled={!interactive}
          onClick={() => select(star)}
          onPointerEnter={() => interactive && setPreview(star)}
          onPointerLeave={() => setPreview(null)}
          onKeyDown={(e) => onKeyDown(e, star)}
          onFocus={() => setFocusStar(star)}
          onBlur={(e) => {
            // Al salir del grupo, el tab vuelve a la estrella marcada.
            const next = e.relatedTarget as Node | null;
            if (!e.currentTarget.parentElement?.contains(next)) {
              setFocusStar(null);
            }
          }}
          aria-label={`${star} / 5`}
          className={`${starCls(star <= active)} disabled:pointer-events-none`}
        >
          <StarIcon filled={star <= active} className="h-7 w-7" />
        </button>
      ))}
    </div>
  );
}
