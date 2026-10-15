"use client";

import { useLocale } from "next-intl";
import { getDateFmt } from "@/lib/intl";
const compactFmt = (locale: string) => getDateFmt(locale, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fullFmt = (locale: string) => getDateFmt(locale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = (locale: string) => getDateFmt(locale, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // "22:00" - compacto para columnas de hora
});

type EventDateVariant = "compact" | "full" | "time";

type EventDateProps = {
  start: string | Date;
  /** Si se entrega, muestra un rango "start – end" (end siempre en formato hora). */
  end?: string | Date;
  variant?: EventDateVariant;
  className?: string;
};

export function EventDate({
  start,
  end,
  variant = "compact",
  className = "",
}: EventDateProps) {
  const locale = useLocale();
  const s = new Date(start);
  const fmt =
    variant === "full" ? fullFmt : variant === "time" ? timeFmt : compactFmt;
  const text = end
    ? `${fmt(locale).format(s)} – ${timeFmt(locale).format(new Date(end))}`
    : fmt(locale).format(s);

  return (
    <time dateTime={s.toISOString()} className={className}>
      {text}
    </time>
  );
}
