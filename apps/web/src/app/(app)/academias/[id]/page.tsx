import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import academyExtrasPart from "@/i18n/parts/academyExtras.json";
import subscriptionsPart from "@/i18n/parts/subscriptions.json";
import { Badge, Button, Card } from "@/components/ui";
import { InstructorsSection } from "@/components/academy/instructors-section";
import { ClassCard, type ClassCardData } from "@/components/classes/class-card";
import {
  SubscriptionManage,
  type SubscriptionInfo,
} from "@/components/academy/subscription-manage";
import { ProfilePlansSection } from "@/components/academy/profile-plans-section";

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
  instagram: string | null;
  whatsapp: string | null;
  website: string | null;
  /** Precio único de la clase particular; null = la academia no la vende. */
  privateLessonPrice: number | null;
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
    weeklyClasses: number | null;
    periodDays: number | null;
    description: string[];
  }[];
  myEnrollment: {
    status: "ACTIVE" | "PAUSED" | "TRIAL" | "FROZEN" | "ONLINE";
    startedAt: string | null;
    endsAt: string | null;
    plan: { id: string; name: string; type: string } | null;
  } | null;
  /** Suscripción Flow más reciente del viewer a esta academia. */
  mySubscription: SubscriptionInfo | null;
  /** Mora SaaS (S3): la ficha sigue respondiendo pero sin CTAs de
      compra — el alumno ve "no disponible" (la falta es del owner). */
  billingBlocked: boolean;
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

// website es texto libre: puede venir sin protocolo o malformado —
// `new URL` en render SSR lanzaría y rompería la ficha. Se prueba
// tal cual y luego con https:// prefijado; si nada resuelve, null
// (el ícono de sitio web no se muestra).
function resolveWebsite(raw: string): { href: string; host: string } | null {
  for (const candidate of [raw, `https://${raw}`]) {
    try {
      const u = new URL(candidate);
      if (u.hostname) {
        return { href: u.href, host: u.hostname.replace(/^www\./, "") };
      }
    } catch {
      // probar la siguiente forma
    }
  }
  return null;
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
  searchParams,
}: {
  params: { id: string };
  // `sub` lo escribe el redirect de POST /payments/flow/customer-return
  // (retorno del disclaimer de registro de tarjeta): ok | error.
  searchParams: { sub?: string };
}) {
  const t = { ...messages.academy, ...academyExtrasPart.academy };
  const tc = messages.common;
  const ts = subscriptionsPart.subscriptions;
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
  const website = academy.website ? resolveWebsite(academy.website) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-6 pt-6 sm:px-6">
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
        {/* Contacto — iconos públicos (Instagram/WhatsApp/sitio web) */}
        {(academy.instagram || academy.whatsapp || website) && (
          <div className="flex flex-wrap gap-2">
            {academy.instagram && (
              <a
                href={`https://instagram.com/${academy.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.profile.contactInstagram.replace(
                  "{handle}",
                  academy.instagram,
                )}
                title={`@${academy.instagram}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-night-700 bg-night-800 text-white/80 transition-colors hover:border-neon/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-neon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                </svg>
              </a>
            )}
            {academy.whatsapp && (
              <a
                href={`https://wa.me/${academy.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.profile.contactWhatsapp}
                title="WhatsApp"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-night-700 bg-night-800 text-white/80 transition-colors hover:border-neon/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-neon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </a>
            )}
            {website && (
              <a
                href={website.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t.profile.contactWebsite.replace(
                  "{host}",
                  website.host,
                )}
                title={website.host}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-night-700 bg-night-800 text-white/80 transition-colors hover:border-neon/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="h-4 w-4 text-neon"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </a>
            )}
          </div>
        )}
      </header>

      {/* Academia bloqueada por mora SaaS (S3): la ficha informa pero
          los CTAs de compra/reserva quedan deshabilitados — copy
          honesto, la falta es del owner, no del alumno. */}
      {academy.billingBlocked && (
        <Card role="status">
          <p className="text-sm text-white/70">{t.profile.unavailable}</p>
        </Card>
      )}

      {/* Retorno del disclaimer de tarjeta de Flow (customer-return →
          303 ?sub=ok|error). ok: la sub puede seguir ACTIVATING — el
          bloque de gestión de abajo refleja el estado real. */}
      {searchParams.sub === "ok" && (
        <Card>
          <p className="text-sm text-neon">{ts.subOk}</p>
        </Card>
      )}
      {searchParams.sub === "error" && (
        <Card>
          <p role="alert" className="text-sm text-red-400">
            {ts.subError}
          </p>
        </Card>
      )}

      {academy.mySubscription && (
        <SubscriptionManage
          subscription={academy.mySubscription}
          accessUntil={academy.myEnrollment?.endsAt ?? null}
          nextAmount={
            // Sin cargo de servicio (modelo SaaS): Flow cobra solo el
            // precio del plan — mismo amount del plan espejo en
            // subscriptions.service.ts.
            academy.plans.find((p) => p.id === academy.mySubscription!.planId)
              ?.price ?? 0
          }
        />
      )}

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
        <InstructorsSection
          instructors={academy.instructors}
          title={t.profile.instructors}
          moreLabel={t.profile.moreInstructors}
          fewerLabel={t.profile.fewerInstructors}
        />
      )}

      {(academy.plans.length > 0 ||
        (academy.privateLessonPrice ?? 0) > 0) && (
        <ProfilePlansSection
          academyId={academy.id}
          plans={academy.plans}
          privateLessonPrice={academy.privateLessonPrice}
          blocked={academy.billingBlocked}
          activePlanId={
            academy.myEnrollment?.status === "ACTIVE" ||
            academy.myEnrollment?.status === "ONLINE"
              ? (academy.myEnrollment.plan?.id ?? null)
              : null
          }
          subscribedPlanId={
            academy.mySubscription &&
            ["ACTIVE", "CANCEL_PENDING", "PENDING_CARD", "ACTIVATING"].includes(
              academy.mySubscription.status,
            )
              ? academy.mySubscription.planId
              : null
          }
          labels={{
            title: t.profile.plans,
            planActive: t.profile.planActive,
            buyPlan: t.profile.buyPlan,
            extendPlan: t.profile.extendPlan,
            privateLesson: t.profile.privateLesson,
            privateLessonDesc: t.profile.privateLessonDesc,
            unavailable: t.profile.unavailable,
            trialAssigned: t.profile.trialAssigned,
            planClassCount: t.planClassCount,
            planWeeklyCount: t.planWeeklyCount,
            more: t.profile.morePlans,
            fewer: t.profile.fewerPlans,
            planTypeLabels: t.planTypes as Record<string, string>,
          }}
        />
      )}

      <section aria-label={t.profile.classes}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
          {t.profile.classes}
        </h2>
        {academy.classes.length === 0 ? (
          <p className="text-sm text-white/50">{t.profile.classesEmpty}</p>
        ) : (
          <>
            {/* Las 2 próximas; el resto vive en /clases?s=explorar con el
                filtro de academia — la ficha no es el explorador. */}
            <ul className="flex flex-col gap-3">
              {academy.classes.slice(0, 2).map((c) => (
                <li key={c.id}>
                  <ClassCard
                    cls={c}
                    when={`${dayFmt.format(new Date(c.date))} · ${c.startTime}–${c.endTime}`}
                  />
                </li>
              ))}
            </ul>
            {academy.classes.length > 2 && (
              <div className="mt-3 flex justify-center">
                <Button
                  href={`/clases?s=explorar&academy=${academy.id}`}
                  variant="ghost"
                  size="sm"
                >
                  {t.profile.moreClasses}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
