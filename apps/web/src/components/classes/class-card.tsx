"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, LevelBars, PriceTag } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/spinner";

// Shape único del card de clase — lo devuelven /classes/browse,
// /classes/mine (reservadas) y /home/stats (nextClass + myClasses).
// scope=past agrega `status` (ver HistoryCardData más abajo).
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
  // Cuota del plan del viewer para la semana/academia de esta clase
  // (solo /classes/mine la adjunta; null = ilimitado o sin cuota).
  credits?: {
    kind: "WEEKLY" | "PACK";
    used: number | null;
    limit: number | null;
  } | null;
  academy: { id: string; name: string };
  instructor: { id: string; name: string | null } | null;
  // Todo slot pertenece a una serie — series nunca es null en clases.
  series: {
    id: string;
    name: string;
    level: { id: string; name: string; order: number } | null;
    style: { id: string; name: string; genre: string | null } | null;
    dropInPrice: number | null;
    // Modalidad efectiva del horario: slot.types si declara, si no los de la serie.
    types: { id: string; name: string }[];
  };
};

// Una particular comprada viaja en /classes/mine como una reserva más
// (aforo 1, sin recurrencia): sin serie ni slot; sin fecha asignada
// date/startTime van null y el grupo "Por agendar" las muestra.
// Mismo componente card — el título cae a "Clase particular".
export type LessonCardData = Omit<
  ClassCardData,
  "date" | "startTime" | "endTime" | "weekday" | "series" | "academy"
> & {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  weekday: number | null;
  series: null;
  academy: { id: string; name: string | null };
};

// Lo que devuelve /classes/mine: reserva de clase o particular —
// indistinguibles en el card (esa es la idea).
export type MineCardData = ClassCardData | LessonCardData;

// Card del explorador de clases: [serie + meta] [acción]. En /clases el
// día y la hora los dan los headings del grupo; fuera de ese contexto el
// caller pasa `when` ("Hoy · 19:00–20:00") como línea eyebrow.
export function ClassCard({
  cls,
  when,
  busy,
  onBook,
  statusBadge,
}: {
  cls: MineCardData;
  when?: string;
  busy?: boolean;
  onBook?: (cls: MineCardData) => void;
  /** Badge de estado externo (historial: Asististe/Cancelaste) —
      reemplaza al slot de acción; la clase pasada no tiene CTA. */
  statusBadge?: { label: string; variant?: BadgeVariant };
}) {
  const t = useTranslations("classes");
  const full = cls.spotsLeft <= 0;
  const style = cls.series?.style;
  const booked = cls.myBooking === "BOOKED" || cls.myBooking === "WAITLIST";
  return (
    <div className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
      {/* Contenido (link a la ficha) + columna de acción que solo
          existe cuando la clase no está reservada. */}
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
            {style?.name ?? cls.series?.name ?? t("privateLesson")}
          </h3>
          {/* Modalidad + nivel visual (barras): una fila de tags
              compactos — el nivel ocupa ~20px sin texto */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {cls.series?.types.map((x) => (
              <Badge key={x.id} variant="outline">
                {x.name}
              </Badge>
            ))}
            {cls.series?.level && (
              <LevelBars
                order={cls.series.level.order}
                name={cls.series.level.name}
              />
            )}
          </div>
          {/* Academia en su propia fila — el nombre propio largo nunca
              parte la fila de chips a medias */}
          <div className="mt-1.5">
            <Badge
              variant="neon"
              className="max-w-44 truncate normal-case tracking-normal"
            >
              {cls.academy.name}
            </Badge>
          </div>
          {/* Meta: profesor */}
          {cls.instructor?.name && (
            <p className="mt-1.5 truncate text-xs text-white/50">
              {cls.instructor.name}
            </p>
          )}
          {/* Créditos del plan — solo en "Mis clases" (mine adjunta la
              cuota de la semana de la clase). */}
          {cls.credits?.limit != null && (
            <p className="mt-1 text-xs font-medium text-neon/80">
              {cls.credits.kind === "PACK"
                ? t("creditsPackShort", {
                    used: cls.credits.used ?? 0,
                    limit: cls.credits.limit,
                  })
                : t("creditsWeeklyShort", {
                    used: cls.credits.used ?? 0,
                    limit: cls.credits.limit,
                  })}
            </p>
          )}
        </Link>
        {/* Slot de acción top-right: Reservado/Espera como badge, o el
            CTA con el caption de cupos centrado debajo. Mismo ancla en
            todos los estados — rail estable aunque la altura del card
            varíe. Cancelar NO va en el card — la acción destructiva
            vive al pie de la ficha. */}
        {statusBadge ? (
          <Badge
            variant={statusBadge.variant ?? "neon"}
            className="shrink-0 self-start"
          >
            {statusBadge.label}
          </Badge>
        ) : booked ? (
          <Badge
            variant={cls.myBooking === "BOOKED" ? "neon" : "outline"}
            className="shrink-0 self-start"
          >
            {cls.myBooking === "BOOKED" ? t("booked") : t("waitlist")}
          </Badge>
        ) : (
          <div className="flex shrink-0 flex-col items-center gap-1 self-start py-0.5">
            {!cls.enrolled ? (
              // Academia ajena (vista explore): sin inscripción vigente
              // no hay reserva — el API lo rechazaría con 403. Pero si
              // la serie vende clase suelta (dropInPrice), el precio
              // informa mejor que el candado.
              cls.series?.dropInPrice != null ? (
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/40">
                    {t("dropIn")}
                  </span>
                  <PriceTag amount={cls.series.dropInPrice} />
                </span>
              ) : (
                <span className="text-center text-xs leading-tight text-white/40">
                  {t("requiresEnrollment")}
                </span>
              )
            ) : full ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => onBook?.(cls)}
              >
                {busy && <Spinner size="sm" />}
                {t("joinWaitlist")}
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => onBook?.(cls)}>
                {busy && <Spinner size="sm" />}
                {t("book")}
              </Button>
            )}
            <span
              className={`text-center text-xs font-medium leading-tight ${
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
          </div>
        )}
      </div>
    </div>
  );
}

// GET /classes/mine?scope=past — historial del alumno: card completo
// + status de resultado (attended gana el dedup sobre la cancelación;
// una particular DONE cuenta como attended).
export type HistoryCardData = MineCardData & {
  status: "attended" | "cancelled";
};
