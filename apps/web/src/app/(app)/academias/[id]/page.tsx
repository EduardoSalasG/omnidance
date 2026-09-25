import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import messages from "../../../../../messages/es-CL.json";
import academyExtrasPart from "@/i18n/parts/academyExtras.json";
import subscriptionsPart from "@/i18n/parts/subscriptions.json";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import { ClassCard, type ClassCardData } from "@/components/classes/class-card";
import { PlanPurchaseCta } from "@/components/academy/plan-purchase-cta";
import {
  SubscriptionManage,
  type SubscriptionInfo,
} from "@/components/academy/subscription-manage";

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

// Cargo de servicio de membresía — GET /api/params/public (whitelist).
// El disclosure de suscripción debe mostrar el total real que Flow
// debita (precio + fee — mismo amount del plan espejo en
// subscriptions.service.ts). Si el endpoint falla se usa el mismo
// fallback que el service (500).
async function getMembershipFee(): Promise<number> {
  const res = await fetch(`${API_URL}/api/params/public`, {
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return 500;
  const params = (await res.json()) as Record<string, unknown>;
  const fee = params["service_fee.membership_clp"];
  return typeof fee === "number" && fee >= 0 ? fee : 500;
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
  const [academy, membershipFee] = await Promise.all([
    getProfile(params.id),
    getMembershipFee(),
  ]);

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
        {/* Contacto — Instagram/WhatsApp públicos de la academia */}
        {(academy.instagram || academy.whatsapp) && (
          <div className="flex flex-wrap gap-2">
            {academy.instagram && (
              <a
                href={`https://instagram.com/${academy.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-night-700 bg-night-800 px-3 text-sm text-white/80 transition-colors hover:border-neon/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60"
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
                @{academy.instagram}
              </a>
            )}
            {academy.whatsapp && (
              <a
                href={`https://wa.me/${academy.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-night-700 bg-night-800 px-3 text-sm text-white/80 transition-colors hover:border-neon/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon/60"
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
                WhatsApp
              </a>
            )}
          </div>
        )}
      </header>

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
          <ul className="flex flex-col gap-3">
            {academy.plans.map((p) => {
              // El plan vigente se marca; el resto sigue comprable
              // (renovar/extiende la vigencia al pagar).
              const isActivePlan =
                (academy.myEnrollment?.status === "ACTIVE" ||
                  academy.myEnrollment?.status === "ONLINE") &&
                academy.myEnrollment.plan?.id === p.id;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 rounded-2xl border border-night-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {p.name}
                        {isActivePlan && (
                          <Badge variant="neon">{t.profile.planActive}</Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50">
                        {(t.planTypes as Record<string, string>)[p.type] ??
                          p.type}
                        {p.classCount ? ` · ${p.classCount} clases` : ""}
                      </p>
                    </div>
                    <PriceTag amount={p.price} />
                  </div>
                  {p.description.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5 text-sm text-white/70">
                      {p.description.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <PlanPurchaseCta
                    planId={p.id}
                    label={
                      isActivePlan ? t.profile.extendPlan : t.profile.buyPlan
                    }
                    planType={p.type}
                    recurringAmount={
                      typeof p.price === "number"
                        ? p.price + membershipFee
                        : undefined
                    }
                  />
                </li>
              );
            })}
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
