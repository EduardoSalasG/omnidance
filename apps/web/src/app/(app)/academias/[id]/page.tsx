import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import academyExtrasPart from "@/i18n/parts/academyExtras.json";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { ClassCard, type ClassCardData } from "@/components/classes/class-card";

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// GET /academies/:id/profile — ficha pública de la academia (cualquier
// autenticado; la consola de gestión vive en /academia): datos,
// dirección/coords, estilos impartidos (derivados de series activas),
// profesores, planes activos, próximas clases (shape ClassCardData) y
// `myEnrollment` = inscripción del viewer si existe.
type AcademyProfile = {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  styles: { id: string; name: string; genre: string | null }[];
  instructors: {
    personId: string;
    name: string | null;
    photoUrl: string | null;
  }[];
  plans: {
    id: string;
    name: string;
    type: string;
    price: number;
    classCount: number | null;
    periodDays: number | null;
  }[];
  myEnrollment: {
    status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
    plan: { name: string; type: string } | null;
  } | null;
  classes: ClassCardData[];
};

async function getProfile(id: string): Promise<AcademyProfile | "error"> {
  const res = await fetch(`${API_URL}/api/academies/${id}/profile`, {
    cache: "no-store",
    headers: { cookie: cookies().toString() },
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return "error";
  return (await res.json()) as AcademyProfile;
}

// Class.date llega a medianoche UTC — formatear en UTC para no correr
// el día (misma convención que /clases).
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export default async function AcademiaDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = { ...messages.academy, ...academyExtrasPart.academy };
  const tc = messages.common;
  const academy = await getProfile(params.id);

  if (academy === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-white/60">{tc.error}</p>
        <Button href="/academias" variant="secondary">
          {tc.back}
        </Button>
      </main>
    );
  }

  const statusLabel = academy.myEnrollment
    ? (t.learner.status as Record<string, string>)[
        academy.myEnrollment.status
      ]
    : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold leading-tight">
            {academy.name}
          </h1>
          {statusLabel && (
            <Badge
              variant={
                academy.myEnrollment!.status === "ACTIVE" ||
                academy.myEnrollment!.status === "ONLINE"
                  ? "neon"
                  : "muted"
              }
            >
              {statusLabel}
            </Badge>
          )}
        </div>
        {/* Estilos que imparte — chips bajo el título, como la ficha
            de clase */}
        {academy.styles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {academy.styles.map((s) => (
              <Badge
                key={s.id}
                variant="outline"
                className="normal-case tracking-normal"
              >
                {s.name}
              </Badge>
            ))}
          </div>
        )}
        {academy.address && (
          <p className="flex items-center gap-1.5 text-white/70">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4 shrink-0 text-neon"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {academy.address}
          </p>
        )}
      </header>

      {academy.description && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.profile.about}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">
            {academy.description}
          </p>
        </Card>
      )}

      {academy.instructors.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.profile.instructors}
          </h2>
          <ul className="flex flex-col gap-3">
            {academy.instructors.map((i) => (
              <li key={i.personId} className="flex items-center gap-3">
                <PartnerAvatar
                  name={i.name ?? "—"}
                  photoUrl={i.photoUrl}
                  size="md"
                />
                <p className="font-medium">{i.name ?? "—"}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {academy.plans.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
            {t.profile.plans}
          </h2>
          <ul className="flex flex-col gap-2">
            {academy.plans.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="text-xs text-white/50">
                    {(t.planTypes as Record<string, string>)[p.type] ??
                      p.type}
                    {p.classCount ? ` · ${p.classCount} clases` : ""}
                  </p>
                </div>
                <PriceTag amount={p.price} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-label={t.profile.classes}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t.profile.classes}
        </h2>
        {academy.classes.length === 0 ? (
          <p className="text-sm text-white/50">{t.profile.classesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {academy.classes.map((c) => (
              <li key={c.id}>
                <ClassCard
                  cls={c}
                  when={`${dayFmt.format(new Date(c.date))} · ${c.startTime}–${c.endTime}`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
