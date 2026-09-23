"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@/components/ui";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/spinner";

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
  const booked = cls.myBooking === "BOOKED" || cls.myBooking === "WAITLIST";
  return (
    <div className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
      {/* Acción anclada a los bordes: primaria arriba (alineada al
          título), "Cancelar" abajo (alineado a la línea meta). Así la
          columna derecha no queda ragged aunque el contenido varíe. */}
      <div className="flex items-stretch gap-3">
        <Link
          href={`/clases/${cls.id}`}
          className="min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {when && (
            <p className="mb-0.5 text-xs font-medium text-neon">{when}</p>
          )}
          {/* Estilo solo como título — es lo que el dancer busca.
              h3: h2 lo tienen las secciones (semana / día / home). */}
          <h3 className="truncate text-base font-semibold leading-snug">
            {style?.name ?? cls.series.name}
          </h3>
          {/* Academia chip neon + tipo outline + nivel muted — tres
              variantes, tres jerarquías distinguibles. Academy es
              nombre propio: sin uppercase y con tope de ancho. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant="neon"
              className="max-w-44 truncate normal-case tracking-normal"
            >
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
          {/* Meta en una sola línea: profesor + cupo. Menos líneas =
              alturas de card consistentes y lectura en un barrido. */}
          <p className="mt-1.5 truncate text-xs">
            {cls.instructor?.name && (
              <span className="text-white/50">
                {cls.instructor.name}
                <span aria-hidden="true"> · </span>
              </span>
            )}
            <span
              className={`font-medium ${
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
            </span>
          </p>
        </Link>
        <div className="flex shrink-0 flex-col items-end justify-between py-0.5">
          {cls.myBooking === "BOOKED" ? (
            <Badge variant="neon">{t("booked")}</Badge>
          ) : cls.myBooking === "WAITLIST" ? (
            <Badge variant="outline">{t("waitlist")}</Badge>
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
              {busy && <Spinner size="sm" />}
              {t("joinWaitlist")}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onBook(cls)}>
              {busy && <Spinner size="sm" />}
              {t("book")}
            </Button>
          )}
          {booked && (
            <CancelBookingButton
              busy={busy}
              onConfirm={() => onCancel(cls.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// GET /classes/mine — reserva activa del learner. También la devuelve
// /home/stats (myClasses) con el mismo shape.
export type BookingCardData = {
  bookingId: string;
  status: "BOOKED" | "WAITLIST";
  classId: string;
  date: string;
  weekday: number;
  startTime: string;
  endTime: string;
  academy: { id: string; name: string };
  series: {
    name: string;
    level: { id: string; name: string } | null;
    style: { id: string; name: string; genre: string | null } | null;
  };
};

// Card wallet de una reserva (símil de Mis entradas): datos de la clase
// + credencial QR + cancelación. `when` = etiqueta de día ("Hoy", fecha)
// que en /clases dan los headings de grupo.
export function BookingCard({
  b,
  when,
  busy,
  onCancel,
}: {
  b: BookingCardData;
  when: string;
  busy: boolean;
  onCancel: (classId: string) => void;
}) {
  const t = useTranslations("classes");
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/clases/${b.classId}`}
          className="flex min-w-0 flex-col gap-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <p className="truncate text-lg font-semibold">{b.series.name}</p>
          <p className="text-sm text-white/60">
            {when} · {b.startTime}–{b.endTime}
          </p>
          {/* Academy = nombre propio: chip neon como en los demás cards */}
          <Badge
            variant="neon"
            className="self-start normal-case tracking-normal"
          >
            {b.academy.name}
          </Badge>
        </Link>
        <Badge variant={b.status === "BOOKED" ? "neon" : "outline"}>
          {b.status === "BOOKED" ? t("booked") : t("waitlist")}
        </Badge>
      </div>
      {/* El QR es la credencial de check-in — misma fila que el ticket */}
      <Link
        href="/qr"
        className="flex min-h-11 items-center justify-between rounded-xl border border-night-700 bg-night-800 px-4 text-sm text-neon transition-colors hover:border-neon/60"
      >
        <span>{t("qrHint")}</span>
        <span aria-hidden="true">→</span>
      </Link>
      <CancelBookingButton busy={busy} onConfirm={() => onCancel(b.classId)} />
    </Card>
  );
}
