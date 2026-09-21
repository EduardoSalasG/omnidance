const compactFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fullFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("es-CL", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23", // "22:00" — compacto para columnas de hora
});

export type EventDateVariant = "compact" | "full" | "time";

export type EventDateProps = {
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
  const s = new Date(start);
  const fmt =
    variant === "full" ? fullFmt : variant === "time" ? timeFmt : compactFmt;
  const text = end
    ? `${fmt.format(s)} – ${timeFmt.format(new Date(end))}`
    : fmt.format(s);

  return (
    <time dateTime={s.toISOString()} className={className}>
      {text}
    </time>
  );
}
