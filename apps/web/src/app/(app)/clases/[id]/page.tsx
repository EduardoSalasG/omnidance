import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import classesPart from "@/i18n/parts/classes.json";
import {
  Badge,
  Button,
  Card,
  LevelBars,
  PriceTag,
  RefreshIcon,
} from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { ClassBookingCta } from "@/components/classes/class-booking-cta";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// GET /classes/:id — ficha alumno: serie (estilo/nivel/modalidad/precio
// suelta), academia, instructor efectivo, cupos y mi estado.
type ClassDetail = {
  id: string;
  date: string; // ISO — medianoche UTC del día de la clase
  startTime: string;
  endTime: string;
  weekday: number;
  cancelled: boolean;
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  waitlistCount: number;
  myBooking: "BOOKED" | "WAITLIST" | null;
  // Asiento comprado suelto (orden WORKSHOP) — no se devuelve el pago
  // al cancelar (gestión manual con la academia).
  myBookingPaid: boolean;
  attended: boolean;
  // Inscripción vigente en la academia — habilita reservar.
  enrolled: boolean;
  // Ventana de devolución (param classes.cancel_refund_minutes) y cuota
  // del plan vigente sobre esta clase — null si ilimitado/sin cuota.
  cancelRefundMinutes: number;
  myCredits: {
    kind: "WEEKLY" | "PACK";
    used: number | null;
    limit: number | null;
  } | null;
  academy: { id: string; name: string };
  instructor: {
    id: string;
    name: string | null;
    photoUrl: string | null;
    instagram: string | null;
  } | null;
  series: {
    id: string;
    name: string;
    description: string | null;
    level: { name: string; order: number } | null;
    style: { name: string; genre: string | null } | null;
    dropInPrice: number | null;
    types: { id: string; name: string }[];
  };
  upcoming: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
  }[];
};

// El endpoint va con SessionGuard — cookie del request, como en
// /eventos/[id] (getMissions).
async function getClass(id: string): Promise<ClassDetail | "error"> {
  const res = await fetch(`${API_URL}/api/classes/${id}`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as ClassDetail;
}

// Class.date llega como ISO a medianoche UTC — se formatea en UTC para
// no correr el día (misma convención que la lista /clases).
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const dayShortFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function ClaseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = { ...messages.classes, ...classesPart.classes };
  const tc = messages.common;
  const cls = await getClass(params.id);

  if (cls === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p role="alert" className="text-white/60">{tc.error}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {/* Server page: el retry es recargar la misma ruta. */}
          <Button href={`/clases/${params.id}`}>
            <RefreshIcon /> {tc.retry}
          </Button>
          <Button href="/clases" variant="secondary">
            {tc.back}
          </Button>
        </div>
      </main>
    );
  }

  const full = cls.spotsLeft <= 0;
  const isPast = new Date(cls.date).getTime() < Date.now() - 24 * 60 * 60 * 1000;
  const dateLabel = `${dayFmt.format(new Date(cls.date))} · ${cls.startTime}–${cls.endTime}`;
  // Inicio real de la clase (día UTC + HH:mm) — base del corte de
  // devolución en el sheet de cancelación.
  const [sh, sm] = cls.startTime.split(":").map(Number);
  const startsAtIso = new Date(
    new Date(cls.date).getTime() + ((sh || 0) * 60 + (sm || 0)) * 60_000,
  ).toISOString();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold leading-tight">
          {cls.series.style?.name ?? cls.series.name}
        </h1>
        {/* Chips bajo el título — mismo set que el card del explorador:
            modalidad outline, nivel como barras, academia neon y
            badges de estado. El nombre de la serie no va: repite
            estilo + nivel que ya están acá. */}
        <div className="flex flex-wrap items-center gap-2">
          {cls.series.types.map((tp) => (
            <Badge key={tp.id} variant="outline">
              {tp.name}
            </Badge>
          ))}
          {cls.series.level && (
            <LevelBars
              order={cls.series.level.order}
              name={cls.series.level.name}
            />
          )}
          {/* Academy = nombre propio: chip neon como en los cards */}
          <Badge variant="neon" className="normal-case tracking-normal">
            {cls.academy.name}
          </Badge>
          {/* Mi reserva — mismo lugar semántico que el badge top-right
              del ClassCard; se re-sincroniza vía router.refresh() tras
              reservar/cancelar en la barra de acción. */}
          {cls.myBooking === "BOOKED" ? (
            <Badge variant="neon">
              {cls.myBookingPaid ? t.paidTag : t.booked}
            </Badge>
          ) : cls.myBooking === "WAITLIST" ? (
            <Badge variant="outline">{t.waitlist}</Badge>
          ) : null}
          {cls.cancelled && <Badge variant="outline">{t.cancelledTag}</Badge>}
          {cls.attended && <Badge variant="neon">{t.attendedTag}</Badge>}
        </div>
        <p className="text-white/70">{dateLabel}</p>
      </header>

      {/* Profesor — quién la imparte es dato clave de la ficha */}
      {cls.instructor?.name && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.instructor}
          </h2>
          <div className="flex items-center gap-3">
            <PartnerAvatar
              name={cls.instructor.name}
              photoUrl={cls.instructor.photoUrl}
              size="md"
            />
            <div className="min-w-0">
              <p className="font-medium">{cls.instructor.name}</p>
              {cls.instructor.instagram && (
                <a
                  href={`https://instagram.com/${cls.instructor.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-neon underline-offset-4 hover:underline"
                >
                  @{cls.instructor.instagram}
                </a>
              )}
            </div>
          </div>
        </Card>
      )}

      {cls.series.description && (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">
            {cls.series.description}
          </p>
        </Card>
      )}

      {/* Cupo + precio de clase suelta */}
      <Card>
        <dl className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-white/50">
              {t.capacityLabel}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {full ? (
                <span className="text-white/60">
                  {t.full}
                  {cls.waitlistCount > 0 && (
                    <span className="text-white/40">
                      {" "}
                      · {t.waitlistCount.replace("{count}", String(cls.waitlistCount))}
                    </span>
                  )}
                </span>
              ) : (
                <span
                  className={
                    cls.spotsLeft <= 3 ? "text-amber-300" : "text-neon"
                  }
                >
                  {cls.spotsLeft} / {cls.capacity}
                </span>
              )}
            </dd>
          </div>
          {cls.series.dropInPrice != null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-white/50">
                {t.dropIn}
              </dt>
              <dd className="mt-1">
                <PriceTag amount={cls.series.dropInPrice} className="text-xl" />
              </dd>
            </div>
          )}
        </dl>
      </Card>

      {/* Próximas sesiones de la misma serie — navegación entre fechas */}
      {cls.upcoming.length > 0 && (
        <section aria-label={t.upcomingSessions}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.upcomingSessions}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {cls.upcoming.map((u) => (
              <li key={u.id}>
                <Link
                  href={`/clases/${u.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-medium text-white/70 transition-colors hover:border-neon/50 hover:text-white active:scale-[0.97]"
                >
                  {dayShortFmt.format(new Date(u.date))} · {u.startTime}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Acción en barra fija sobre la BottomNav (patrón de la ficha
          de evento); cancelar queda como zona destructiva en el pie.
          Clase cancelada/pasada → la barra muestra solo un aviso. */}
      <ClassBookingCta
        classId={cls.id}
        initialBooking={cls.myBooking}
        initialPaid={cls.myBookingPaid}
        enrolled={cls.enrolled}
        academyId={cls.academy.id}
        spotsLeft={cls.spotsLeft}
        capacity={cls.capacity}
        waitlistCount={cls.waitlistCount}
        myCredits={cls.myCredits}
        cancelRefundMinutes={cls.cancelRefundMinutes}
        startsAtIso={startsAtIso}
        dropInPrice={cls.series.dropInPrice}
        closedLabel={
          cls.cancelled ? t.cancelledTag : isPast ? t.pastTag : undefined
        }
      />
    </main>
  );
}
