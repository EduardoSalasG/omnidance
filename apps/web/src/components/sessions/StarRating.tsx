"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type StarRatingProps = {
  /** Puntaje ya registrado. Si no hay onSelect, se muestra solo lectura. */
  value?: number | null;
  onSelect?: (score: number) => void;
  busy?: boolean;
};

const STARS = [1, 2, 3, 4, 5] as const;

/** Cinco estrellas con touch targets >= 44px — usable con pulgar en pista. */
export function StarRating({ value = null, onSelect, busy = false }: StarRatingProps) {
  const t = useTranslations("sessions");
  const [preview, setPreview] = useState<number | null>(null);

  const interactive = Boolean(onSelect) && !busy;
  const active = preview ?? value ?? 0;

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={t("ratePrompt")}
    >
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onSelect?.(star)}
          onPointerEnter={() => interactive && setPreview(star)}
          onPointerLeave={() => setPreview(null)}
          aria-label={`${star} / 5`}
          className={`flex min-h-11 min-w-11 items-center justify-center text-3xl transition-transform active:scale-90 disabled:pointer-events-none ${
            star <= active ? "text-neon" : "text-white/40"
          }`}
        >
          {star <= active ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}
