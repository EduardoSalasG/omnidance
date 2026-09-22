import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import classesPart from "@/i18n/parts/classes.json";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { BackLink } from "@/components/ui/BackLink";
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
  attended: boolean;
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
    level: { name: string } | null;
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
        <p className="text-white/60">{tc.error}</p>
        <Button href="/clases" variant="secondary">
          {tc.back}
        </Button>
      </main>
    );
  }

  const full = cls.spotsLeft <= 0;
  const isPast = new Date(cls.date).getTime() < Date.now() - 24 * 60 * 60 * 1000;
  const dateLabel = `${dayFmt.format(new Date(cls.date))} · ${cls.startTime}–${cls.endTime}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6">
      <BackLink href="/clases">{tc.back}</BackLink>

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {cls.series.types.map((tp) => (
            <Badge key={tp.id} variant="outline">
              {tp.name}
            </Badge>
          ))}
          {cls.cancelled && <Badge variant="outline">{t.cancelledTag}</Badge>}
          {cls.attended && <Badge variant="neon">{t.attendedTag}</Badge>}
        </div>
        <h1 className="text-3xl font-bold leading-tight">
          {cls.series.style ? (
            <>
              {cls.series.style.name}
              {cls.series.level && (
                <span className="font-medium text-white/50">
                  {" "}
                  {cls.series.level.name}
                </span>
              )}
            </>
          ) : (
            cls.series.name
          )}
        </h1>
        <p className="text-sm text-white/60">
          {cls.series.name} · {cls.academy.name}
        </p>
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

      {/* CTA — solo si la clase sigue vigente; la cancelada/pasada queda
          como ficha informativa */}
      <ClassBookingCta
        classId={cls.id}
        initialBooking={cls.myBooking}
        full={full}
        disabled={cls.cancelled || isPast}
      />
    </main>
  );
}
