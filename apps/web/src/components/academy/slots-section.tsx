"use client";

import { useTranslations } from "next-intl";
import { Badge, Card } from "@/components/ui";
import type { ClassSlot } from "./shared";

type Props = {
  slots: ClassSlot[];
};

/**
 * Parrilla semanal de la academia (GET /academies/:id/slots). Solo lectura:
 * todo horario pertenece a una serie — se crean/editan desde /academia/series.
 * capacity null = hereda el quórum de la serie/academia.
 */
export function SlotsSection({ slots }: Props) {
  const t = useTranslations("academy");
  const te = useTranslations("events");

  if (slots.length === 0) {
    return <p className="text-sm text-white/50">—</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {slots.map((s) => (
        <li key={s.id}>
          <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
            <Badge variant="neon">{t(`weekday.${s.weekday}`)}</Badge>
            <span className="font-medium tabular-nums">
              {s.startTime} – {s.endTime}
            </span>
            <span className="truncate text-sm text-white/70">
              {s.series.name}
            </span>
            {s.capacity != null && (
              <span className="ml-auto text-xs text-white/50">
                {te("capacity", { count: s.capacity })}
              </span>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
