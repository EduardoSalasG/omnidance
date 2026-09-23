"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@/components/ui";

// GET /classes/browse — clase materializada futura con contexto de serie.
// También la devuelve /home/stats (nextClass del learner) con el mismo shape.
export type ClassCardData = {
  id: string;
  date: string; // ISO — medianoche UTC del día de la clase
  startTime: string;
  endTime: string;
  weekday: number;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  myBooking: "BOOKED" | "WAITLIST" | null;
  // Inscripción vigente en la academia de la clase — habilita reservar.
  enrolled: boolean;
  academy: { id: string; name: string };
  instructor: { id: string; name: string | null } | null;
  // Todo slot pertenece a una serie — series nunca es null.
  series: {
    id: string;
    name: string;
    level: { id: string; name: string } | null;
    style: { id: string; name: string; genre: string | null } | null;
    dropInPrice: number | null;
    // Modalidad efectiva del horario: slot.types si declara, si no los de la serie.
    types: { id: string; name: string }[];
  };
};

// Cancelar en dos taps: "Cancelar" → inline "¿Seguro? Sí / No". Un
// window.confirm rompe la inmersión de la PWA; inline respeta el sistema.
export function CancelBookingButton({
  busy,
  onConfirm,
}: {
  busy: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(true)}
      >
        {t("cancelBooking")}
      </Button>
    );
  }
  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t("cancelConfirm")}
    >
      <span className="text-xs text-white/60">{t("cancelShort")}</span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {tc("yes")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setConfirming(false)}
      >
        {tc("no")}
      </Button>
    </div>
  );
}

// Card del explorador de clases: [serie + meta] [acción]. En /clases el
// día y la hora los dan los headings del grupo; fuera de ese contexto el
// caller pasa `when` ("Hoy · 19:00–20:00") como línea eyebrow.
export function ClassCard({
  cls,
  when,
  busy,
  onBook,
  onCancel,
}: {
  cls: ClassCardData;
  when?: string;
  busy: boolean;
  onBook: (cls: ClassCardData) => void;
  onCancel: (classId: string) => void;
}) {
  const t = useTranslations("classes");
  const full = cls.spotsLeft <= 0;
  const style = cls.series.style;
  return (
    <div className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
      <div className="flex items-start gap-3">
        {/* Contenido en 4 líneas: estilo (título) / tipo+nivel
            diferenciados / academia+profe / cupo. El bloque entero
            linkea a la ficha de la clase. */}
        <Link
          href={`/clases/${cls.id}`}
          className="min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {when && (
            <p className="mb-0.5 text-xs font-medium text-neon">{when}</p>
          )}
          {/* Estilo solo como título — es lo que el dancer busca */}
          <h2 className="truncate text-base font-semibold leading-snug">
            {style?.name ?? cls.series.name}
          </h2>
          {/* Academia chip neon + tipo outline + nivel muted — tres
              variantes, tres jerarquías distinguibles. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {/* Academy = nombre propio: sin el uppercase del Badge */}
            <Badge variant="neon" className="normal-case tracking-normal">
              {cls.academy.name}
            </Badge>
            {cls.series.types.map((x) => (
              <Badge key={x.id} variant="outline">
                {x.name}
              </Badge>
            ))}
            {cls.series.level && (
              <Badge variant="muted">{cls.series.level.name}</Badge>
            )}
          </div>
          {/* Profesor (la academia ya está en el chip) */}
          {cls.instructor?.name && (
            <p className="mt-1 truncate text-xs text-white/50">
              {cls.instructor.name}
            </p>
          )}
          <p
            className={`mt-1 text-xs font-medium ${
              full
                ? "text-white/50"
                : cls.spotsLeft <= 3
                  ? "text-amber-300"
                  : "text-neon"
            }`}
          >
            {full
              ? cls.waitlistCount > 0
                ? `${t("full")} · ${t("waitlistCount", { count: cls.waitlistCount })}`
                : t("full")
              : cls.spotsLeft <= 3
                ? t("lastSpots", { count: cls.spotsLeft })
                : t("spotsLeft", { count: cls.spotsLeft })}
          </p>
        </Link>
        {/* Acción — reservar / espera / estado + cancelar (fuera del
            link para no anidar interactivos) */}
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
          {cls.myBooking === "BOOKED" ? (
            <>
              <Badge variant="neon">{t("booked")}</Badge>
              <CancelBookingButton
                busy={busy}
                onConfirm={() => onCancel(cls.id)}
              />
            </>
          ) : cls.myBooking === "WAITLIST" ? (
            <>
              <Badge variant="outline">{t("waitlist")}</Badge>
              <CancelBookingButton
                busy={busy}
                onConfirm={() => onCancel(cls.id)}
              />
            </>
          ) : !cls.enrolled ? (
            // Academia ajena (vista explore): sin inscripción vigente
            // no hay reserva — el API lo rechazaría con 403.
            <span className="text-xs leading-tight text-white/40">
              {t("requiresEnrollment")}
            </span>
          ) : full ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onBook(cls)}
            >
              {t("joinWaitlist")}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onBook(cls)}>
              {t("book")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
