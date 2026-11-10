"use client";

import { Children, useCallback, useEffect, useState, use } from "react";

import {useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ClockIcon, ConfirmSheet, LIST_PREVIEW, RefreshIcon, SeeAllRow, type BadgeVariant } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import {
  ActionNotice,
  showActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { readError } from "@/components/academy/shared";
import { AdminGate } from "@/components/admin/admin-gate";
import { TrialDateEditor } from "@/components/admin/trial-date-editor";
import type { RoleRow } from "@/components/admin/types";
import { useRouter } from "@/i18n/navigation";
import { getDateFmt, useNumFmt } from "@/lib/intl";
const fmtDate = (iso: string, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

// ── Shape de GET /admin/users/:personId/detail (user-intel.controller) ──

type EventLite = { id: string; name: string; startsAt: string };

type TicketRow = {
  id: string;
  status: string;
  listPrice: number;
  event: EventLite | null;
};

type EventRow = EventLite & { status: string };

type AssignmentRow = {
  id: string;
  role: string;
  event:
    | (EventLite & { producer: { id: string; name: string } | null })
    | null;
};

type ClassRow = {
  id: string;
  startsAt: string;
  style: string | null;
  academy: { id: string; name: string };
};

type GigRow = { id: string; event: EventLite };

type RentalRow = {
  id: string;
  date: string;
  status: string;
  venue: { id: string; name: string };
};

type DancerData = {
  ticketsUpcoming: TicketRow[];
  ticketsPast: TicketRow[];
  dancesCount: number;
  checkinsCount: number;
};
type ProducerData = { eventsUpcoming: EventRow[]; eventsPast: EventRow[] };
type StaffData = { assignments: AssignmentRow[] };
type InstructorData = {
  academies: { id: string; name: string }[];
  classesUpcoming: ClassRow[];
  classesPastCount: number;
};
type AcademyOwnerData = {
  academies: { id: string; name: string; studentsCount: number }[];
};
type DjData = { gigsUpcoming: GigRow[]; gigsPast: GigRow[] };
type VenueManagerData = {
  venues: { id: string; name: string }[];
  rentals: RentalRow[];
};

// roleData llega con una entrada por rol poseído (status ≠ REJECTED);
// los roles sin bloque propio (SUPPORT, ADMIN, customs) traen {}.
type RoleData = {
  DANCER?: DancerData;
  PRODUCER?: ProducerData;
  STAFF?: StaffData;
  INSTRUCTOR?: InstructorData;
  ACADEMY_OWNER?: AcademyOwnerData;
  DJ?: DjData;
  VENUE_MANAGER?: VenueManagerData;
  [role: string]: unknown;
};

type PersonDetail = {
  person: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    photoUrl: string | null;
    isLightAccount: boolean;
    verifiedAt: string | null;
    createdAt: string;
    deletedAt: string | null;
    proTier: string | null;
    proTrialEndsAt: string | null;
  };
  roles: { id: string; role: string; status: string; createdAt: string }[];
  roleData: RoleData;
  // Scores de relación por actor (spec academy-score-refine).
  scores: {
    actorType: string;
    actorId: string;
    actorName: string | null;
    score: number;
    segment: string | null;
    breakdown: Record<string, unknown> | null;
    computedAt: string;
  }[];
};

// Shape de GET /admin/users/:personId/payment-methods
// (user-intel.controller): por cada academia que la persona posee,
// sus cuentas de pasarela BYO (mask público, jamás credenciales) y
// sus métodos manuales.
type GatewayAccountRow = {
  id: string;
  provider: string;
  keyMask: string;
  status: string;
  lastError: string | null;
  verifiedAt: string | null;
  webhookUrl: string;
};

type ManualMethodRow = {
  id: string;
  type: string;
  label: string;
  details: Record<string, unknown> | null;
  active: boolean;
};

type AcademyPayMethods = {
  id: string;
  name: string;
  gatewayAccounts: GatewayAccountRow[];
  manualMethods: ManualMethodRow[];
};

// Shape de GET /admin/users/:personId/timeline (user-intel.controller,
// spec platform-trials §5b): label ya resuelto server-side.
type TimelineItem = {
  id: string;
  at: string;
  type: string;
  label: string;
  ref?: { type: string; id: string };
};

type LoadState = "loading" | "ready" | "notFound" | "error";

// Componentes del breakdown con etiqueta i18n (spec
// academy-score-refine) - clave desconocida cae a renderizar el raw.
const SCORE_COMPONENT_LABELS = [
  "attendanceRecent",
  "weeklyStreak",
  "monthsContinuous",
  "purchases",
  "tenure",
  "referrals",
  "attendance",
  "spend",
  // Semántica PRODUCER (crm.service.ts): eventos + preventa temprana.
  "eventsRecent",
  "eventStreak",
  "earlyPurchases",
];

// Catálogo completo de estados de PersonRole (mismo set que valida la API).
const ROLE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

;
;



const selectCls =
  "min-h-[44px] rounded-lg border border-ink/15 bg-canvas px-3 text-sm";

export default function UsuarioDetallePage(
  props: {
    params: Promise<{ personId: string }>;
  }
) {
  const locale = useLocale();
  const params = use(props.params);
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <AdminGate>
        <UserDetailPanel personId={params.personId} />
      </AdminGate>
    </main>
  );
}

function UserDetailPanel({ personId }: { personId: string }) {
  const locale = useLocale();
  const t = useTranslations("admin");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const tcrm = useTranslations("crm");

  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [payMethods, setPayMethods] = useState<AcademyPayMethods[] | null>(
    null,
  );
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [catalog, setCatalog] = useState<RoleRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  // Aviso post-acción (change unified-action-notice): la ficha no
  // navega en las mutaciones de rol/reactivar, el aviso es local.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [acting, setActing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Cobro directo (spec payments/platform-charges): monto + concepto,
  // confirma por ConfirmSheet antes del cargo.
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeSubject, setChargeSubject] = useState("");
  const [charging, setCharging] = useState(false);
  const [chargeUrl, setChargeUrl] = useState<string | null>(null);
  // Confirmación compartida (revocar rol, cobro directo o baja de la cuenta).
  const [pending, setPending] = useState<
    | { kind: "revoke"; role: string }
    | { kind: "delete" }
    | { kind: "charge" }
    | null
  >(null);
  const router = useRouter();
  const [newRole, setNewRole] = useState("");
  const clpFmt = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });
  const chargeAmountNum = Math.trunc(Number(chargeAmount));
  const chargeValid =
    Number.isFinite(chargeAmountNum) &&
    chargeAmountNum >= 1 &&
    chargeSubject.trim().length > 0;

  const roleLabel = useCallback(
    (r: string) =>
      tp.has(`roleLabels.${r}`)
        ? tp(`roleLabels.${r}`)
        : (catalog.find((c) => c.key === r)?.label ?? r),
    [tp, catalog],
  );
  const statusLabel = (s: string) =>
    t.has(`status.${s}`) ? t(`status.${s}`) : s;

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/admin/users/${personId}/detail`);
      if (res.status === 404) {
        setState("notFound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setDetail((await res.json()) as PersonDetail);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [personId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Línea de vida del actor (spec platform-trials §5b): fetch
  // independiente del detail - un timeline que falla no tumba la ficha.
  useEffect(() => {
    apiFetch(`/admin/users/${personId}/timeline`)
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        const body = (await res.json()) as { items: TimelineItem[] };
        setTimeline(body.items);
      })
      .catch(() => setTimeline([]));
  }, [personId]);

  // Métodos de cobro de las academias del actor (change
  // admin-user-payment-methods): fetch independiente del detail: un
  // fallo no tumba la ficha.
  useEffect(() => {
    apiFetch(`/admin/users/${personId}/payment-methods`)
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        const body = (await res.json()) as {
          academies: AcademyPayMethods[];
        };
        setPayMethods(body.academies);
      })
      .catch(() => setPayMethods([]));
  }, [personId]);

  // Catálogo de roles para el selector "Agregar rol" (y fallback de label
  // para roles custom sin entrada en profile.roleLabels).
  useEffect(() => {
    apiFetch("/admin/roles")
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        setCatalog((await res.json()) as RoleRow[]);
      })
      .catch(() => setActionError(tc("error")));
  }, [tc]);

  // Toda mutación de rol pasa por aquí: serializa acciones, reporta error
  // y recarga la ficha (roleData cambia según los roles poseídos).
  async function mutateRole(
    call: () => Promise<Response>,
    successText: string,
  ) {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      const res = await call();
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      setNewRole("");
      setNotice({ text: successText });
      await load();
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setActing(false);
    }
  }

  const setStatus = (role: string, status: string) =>
    void mutateRole(
      () =>
        apiFetch(`/admin/users/${personId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, status }),
        }),
      t("users.roleSaved"),
    );

  const revoke = (role: string) => {
    void mutateRole(
      () =>
        apiFetch(`/admin/users/${personId}/roles/${role}`, {
          method: "DELETE",
        }),
      t("users.roleRevoked"),
    ).finally(() => setPending(null));
  };

  const addRole = () => {
    if (!newRole) return;
    void mutateRole(
      () =>
        apiFetch(`/admin/users/${personId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole, status: "APPROVED" }),
        }),
      t("users.roleAdded"),
    );
  };

  // Baja lógica (spec admin-user-soft-delete): deletedAt - el grafo de
  // datos queda intacto, auth bloqueada. Reactivar la restaura.
  async function deleteUser() {
    if (!detail || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/admin/users/${personId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setPending(null);
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        setDeleting(false);
        return;
      }
      // Navega al listado: aviso global para que sobreviva el push.
      showActionNotice({ text: t("users.deleteOk") });
      router.push("/admin/usuarios");
    } catch {
      setPending(null);
      setNotice({ text: tc("error"), error: true });
      setDeleting(false);
    }
  }

  async function reactivateUser() {
    if (!detail || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await apiFetch(`/admin/users/${personId}/reactivate`, {
        method: "POST",
      });
      if (res.ok) {
        setNotice({ text: t("users.reactivated") });
        await load();
        return;
      }
      setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setDeleting(false);
    }
  }

  // Cobro suelto plataforma→actor (spec payments/platform-charges):
  // COLLECTED ya liquidó PAID; FAILED fue rechazo del medio de pago;
  // PENDING deja el link del proveedor para compartirlo manualmente.
  async function directCharge() {
    if (!detail || charging) return;
    setCharging(true);
    try {
      const res = await apiFetch("/admin/platform-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId,
          amount: chargeAmountNum,
          subject: chargeSubject.trim(),
        }),
      });
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      const r = (await res.json()) as {
        outcome: string;
        paymentUrl?: string;
      };
      if (r.outcome === "COLLECTED") {
        setNotice({ text: t("users.charge.collected") });
        setChargeAmount("");
        setChargeSubject("");
        setChargeUrl(null);
      } else if (r.outcome === "FAILED") {
        setNotice({ text: t("users.charge.failed"), error: true });
        setChargeUrl(null);
      } else {
        setNotice({ text: t("users.charge.pending") });
        setChargeUrl(r.paymentUrl ?? null);
      }
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setCharging(false);
      setPending(null);
    }
  }

  async function copyChargeUrl() {
    if (!chargeUrl) return;
    try {
      await navigator.clipboard.writeText(chargeUrl);
      setNotice({ text: t("users.charge.copied") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    }
  }

  if (state === "loading") {
    return <SkeletonList />;
  }
  if (state === "notFound") {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("users.detail.notFound")}
      </p>
    );
  }
  if (state === "error" || !detail) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-sm text-ink/70">
          {tc("error")}
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  const { person } = detail;
  const heldRoles = new Set(detail.roles.map((r) => r.role));
  const addableRoles = catalog.filter((c) => !heldRoles.has(c.key));

  return (
    <div className="flex flex-col gap-6">
      {actionError && (
        <p role="alert" className="text-sm text-red-400">
          {actionError}
        </p>
      )}

      {/* Datos personales */}
      <section
        className="flex flex-col gap-3"
        aria-labelledby="personal-h"
      >
        <h2
          id="personal-h"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {t("users.detail.personal")}
        </h2>
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {person.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- URLs externas, dominios no configurados
              <img loading="lazy" decoding="async"
                src={person.photoUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-full border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-line bg-elevated text-2xl font-bold text-neon"
              >
                {person.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{person.name}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {person.deletedAt && (
                  <Badge variant="muted">{t("users.deactivated")}</Badge>
                )}
                {person.verifiedAt && (
                  <Badge variant="neon">{t("users.detail.verified")}</Badge>
                )}
                {person.isLightAccount && (
                  <Badge variant="outline">
                    {t("users.detail.lightAccount")}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <dl className="flex flex-col gap-1.5 text-sm">
            {person.email && (
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink/50">
                  {t("users.detail.email")}
                </dt>
                <dd className="min-w-0 truncate">{person.email}</dd>
              </div>
            )}
            {person.phone && (
              <div className="flex gap-2">
                <dt className="shrink-0 text-ink/50">
                  {t("users.detail.phone")}
                </dt>
                <dd className="min-w-0 truncate">{person.phone}</dd>
              </div>
            )}
            <div className="flex gap-2">
              <dt className="shrink-0 text-ink/50">
                {t("users.detail.memberSince")}
              </dt>
              <dd>{fmtDate(person.createdAt, locale)}</dd>
            </div>
            {/* Trial Producer Pro (spec platform-trials): ajuste admin
                del fin; extender reabre features Pro, acortar las corta. */}
            {(person.proTrialEndsAt != null || heldRoles.has("PRODUCER")) && (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-ink/50">
                  {t("users.detail.proTrial")}
                </dt>
                <dd className="text-sm">
                  <TrialDateEditor
                    endpoint={`/admin/users/${personId}/pro-trial`}
                    value={person.proTrialEndsAt}
                    onSaved={async () => {
                      setNotice({ text: t("trials.saved") });
                      await load();
                    }}
                    onError={(msg) => setNotice({ text: msg, error: true })}
                  />
                </dd>
              </div>
            )}
          </dl>
        </Card>
      </section>

      {/* Gestión de roles - historial completo (incluye REJECTED) */}
      <section className="flex flex-col gap-3" aria-labelledby="roles-h">
        <h2
          id="roles-h"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {t("users.detail.roleHistory")}
        </h2>
        {detail.roles.length === 0 ? (
          <p className="text-sm text-ink/50">{t("users.noRoles")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.roles.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={r.status === "APPROVED" ? "neon" : "outline"}
                    >
                      {roleLabel(r.role)}
                    </Badge>
                    <Badge variant="muted">{statusLabel(r.status)}</Badge>
                    <span className="text-xs text-ink/50">
                      {t("users.detail.grantedAt", {
                        date: fmtDate(r.createdAt, locale),
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={r.status}
                      disabled={acting}
                      onChange={(e) => setStatus(r.role, e.target.value)}
                      aria-label={t("users.roleStatus", {
                        role: roleLabel(r.role),
                      })}
                      className={selectCls}
                    >
                      {ROLE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={acting}
                      onClick={() => setPending({ kind: "revoke", role: r.role })}
                    >
                      {t("users.revoke")}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {addableRoles.length > 0 && (
          <div className="flex items-center gap-2">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              aria-label={t("users.addRole")}
              className={`${selectCls} min-w-0 flex-1`}
            >
              <option value="">{t("users.pickRole")}</option>
              {addableRoles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label || r.key}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              onClick={addRole}
              disabled={acting || !newRole}
            >
              {t("users.addRole")}
            </Button>
          </div>
        )}
      </section>

      {/* Actividad por rol - una card por rol con data (status ≠ REJECTED) */}
      <section className="flex flex-col gap-3" aria-labelledby="roledata-h">
        <h2
          id="roledata-h"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {t("users.detail.roleData")}
        </h2>
        {Object.keys(detail.roleData).length === 0 ? (
          <p className="text-sm text-ink/50">{t("users.roleData.empty")}</p>
        ) : (
          Object.entries(detail.roleData).map(([role, data]) => (
            <Card key={role} className="flex flex-col gap-3 p-4">
              <h3 className="text-sm font-semibold">{roleLabel(role)}</h3>
              <RoleDataBody role={role} data={data} />
            </Card>
          ))
        )}
      </section>

      {/* Métodos de pago de las academias del actor (change
          admin-user-payment-methods): pasarela BYO (solo el mask, las
          credenciales cifradas nunca salen por API) + métodos
          manuales. Mientras carga solo se muestra el skeleton si el
          actor tiene el rol ACADEMY_OWNER; un bailarín sin academias
          no ve la sección (ni el flash del header). */}
      {(payMethods === null
        ? heldRoles.has("ACADEMY_OWNER")
        : payMethods.length > 0) && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="paymethods-h"
        >
          <h2
            id="paymethods-h"
            className="text-sm font-semibold uppercase tracking-wide text-ink/50"
          >
            {t("users.payMethods.title")}
          </h2>
          {payMethods === null ? (
            <SkeletonList />
          ) : (
            payMethods.map((a) => (
              <AcademyPayMethodsCard key={a.id} academy={a} />
            ))
          )}
        </section>
      )}

      {/* Scores de relación por actor (spec academy-score-refine):
          CRM privado por actor - el admin los ve transversal. */}
      {detail.scores.length > 0 && (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="scores-h"
        >
          <h2
            id="scores-h"
            className="text-sm font-semibold uppercase tracking-wide text-ink/50"
          >
            {t("users.scores.title")}
          </h2>
          {detail.scores.map((s) => {
            const pts = (s.breakdown?.points ?? null) as Record<
              string,
              number
            > | null;
            return (
              <Card key={`${s.actorType}:${s.actorId}`} className="flex flex-col gap-3 p-4">
                {/* Header: actor+metadatos | segmento+score (el score es el
                    dato que decide - va grande junto a su segmento) */}
                {/* Dos filas: chips anclados a los bordes arriba,
                    nombre↔score en la segunda línea (baseline) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant={ACTOR_TYPE_VARIANT[s.actorType] ?? "outline"}
                    >
                      {tcrm(`actor.${s.actorType.toLowerCase()}`)}
                    </Badge>
                    {/* Sin segmento → chip "Pendiente" para que el borde
                        derecho no quede vacío */}
                    <Badge
                      variant={
                        s.segment
                          ? (SEGMENT_VARIANT[s.segment] ?? "muted")
                          : "outline"
                      }
                    >
                      {s.segment
                        ? tcrm(`segments.${s.segment}`)
                        : t("users.scores.pending")}
                    </Badge>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold">
                      {s.actorName ?? s.actorId}
                    </p>
                    <span className="shrink-0 text-2xl font-bold leading-none tabular-nums">
                      {Math.round(s.score)}
                      <span className="ml-0.5 text-xs font-normal text-ink/40">
                        {t("users.scores.pts")}
                      </span>
                    </span>
                  </div>
                </div>
                {/* El "porqué" del score separado con divider - es otro
                    grupo visual, no el mismo plano que el veredicto */}
                {pts && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line pt-3 sm:grid-cols-3">
                    {Object.entries(pts).map(([k, v]) => (
                      <Stat
                        key={k}
                        value={`+${v}`}
                        label={
                          SCORE_COMPONENT_LABELS.includes(k)
                            ? t(`users.scores.components.${k}`)
                            : k
                        }
                      />
                    ))}
                  </div>
                )}
                {/* Fecha de cálculo como footnote terciaria al pie - no es
                    dato de decisión, solo trazabilidad */}
                <p className="flex items-center justify-end gap-1 text-[11px] text-ink/40">
                  <ClockIcon className="h-3 w-3" />
                  <span className="sr-only">
                    {t("users.scores.computedAt", { date: "" }).trim()}
                  </span>
                  {fmtDate(s.computedAt, locale)}
                </p>
              </Card>
            );
          })}
        </section>
      )}

      {/* Línea de vida del actor (spec platform-trials §5b): hitos de
          ActivityEvent desc - registro, roles, trial, suscripción,
          pagos, mora. Una card-lista con preview de 5 + SeeAllRow. */}
      <section className="flex flex-col gap-3" aria-labelledby="timeline-h">
        <h2
          id="timeline-h"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {t("users.detail.timeline.title")}
        </h2>
        {timeline === null ? (
          <SkeletonList />
        ) : timeline.length === 0 ? (
          <p className="text-sm text-ink/50">
            {t("users.detail.timeline.empty")}
          </p>
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-line/60">
              {(timelineExpanded
                ? timeline
                : timeline.slice(0, LIST_PREVIEW)
              ).map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-baseline gap-3 px-4 py-2.5"
                >
                  <span className="w-20 shrink-0 text-[11px] tabular-nums text-ink/40">
                    {fmtDate(ev.at, locale)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{ev.label}</span>
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-ink/30">
                    {ev.type}
                  </span>
                </li>
              ))}
              <SeeAllRow
                total={timeline.length}
                expanded={timelineExpanded}
                onToggle={() => setTimelineExpanded((v) => !v)}
              />
            </ul>
          </Card>
        )}
      </section>

      <Button
        href={`/analitica/usuarios/${personId}`}
        variant="secondary"
        className="self-start"
      >
        {t("users.viewAnalytics")}
      </Button>

      {/* Cobro directo (spec payments/platform-charges): cargo puntual
          sobre el medio de pago registrado; sin tarjeta la pasarela
          degrada a link y se comparte manualmente. */}
      <section className="flex flex-col gap-3" aria-labelledby="charge-h">
        <h2
          id="charge-h"
          className="text-sm font-semibold uppercase tracking-wide text-ink/50"
        >
          {t("users.charge.title")}
        </h2>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-ink/60">{t("users.charge.body")}</p>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!chargeValid || charging) return;
              setPending({ kind: "charge" });
            }}
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="charge-amount"
                className="text-xs font-medium text-ink/60"
              >
                {t("users.charge.amount")}
              </label>
              <input
                id="charge-amount"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={chargeAmount}
                onChange={(e) => setChargeAmount(e.target.value)}
                className={selectCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="charge-subject"
                className="text-xs font-medium text-ink/60"
              >
                {t("users.charge.subject")}
              </label>
              <input
                id="charge-subject"
                type="text"
                maxLength={140}
                value={chargeSubject}
                placeholder={t("users.charge.subjectPh")}
                onChange={(e) => setChargeSubject(e.target.value)}
                className={selectCls}
              />
            </div>
            <Button
              type="submit"
              disabled={!chargeValid || charging}
              className="self-start"
            >
              {charging ? tc("loading") : t("users.charge.cta")}
            </Button>
          </form>
          {chargeUrl && (
            <div className="flex flex-col gap-2 rounded-lg border border-line bg-canvas p-3">
              <p className="text-xs font-medium text-ink/60">
                {t("users.charge.payLink")}
              </p>
              <a
                href={chargeUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-neon underline"
              >
                {chargeUrl}
              </a>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                onClick={() => void copyChargeUrl()}
              >
                {t("users.charge.copyLink")}
              </Button>
            </div>
          )}
        </Card>
      </section>

      {/* Zona de peligro - baja lógica auditada (soft delete: datos
          intactos, auth bloqueada; el admin puede reactivar). */}
      <Card className="flex flex-col gap-3 border-red-500/40">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400/80">
          {t("users.delete.title")}
        </h2>
        <p className="text-sm text-ink/60">{t("users.delete.body")}</p>
        {detail.person.deletedAt ? (
          <Button
            variant="secondary"
            onClick={() => void reactivateUser()}
            disabled={deleting}
            className="self-start border-neon/50 text-neon hover:bg-neon/10"
          >
            {deleting ? tc("loading") : t("users.reactivate.cta")}
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => setPending({ kind: "delete" })}
            disabled={deleting}
            className="self-start border-red-500/50 text-red-300 hover:bg-red-500/10"
          >
            {deleting ? tc("loading") : t("users.delete.cta")}
          </Button>
        )}
      </Card>

      <ConfirmSheet
        open={pending !== null}
        title={
          pending?.kind === "revoke"
            ? t("users.revokeConfirm", { role: roleLabel(pending.role) })
            : pending?.kind === "charge"
              ? t("users.charge.confirm", {
                  amount: clpFmt.format(chargeAmountNum),
                  name: detail.person.name,
                  subject: chargeSubject.trim(),
                })
              : t("users.delete.confirm", { name: detail.person.name })
        }
        confirmLabel={
          pending?.kind === "revoke"
            ? t("users.revoke")
            : pending?.kind === "charge"
              ? t("users.charge.confirmCta")
              : t("users.delete.cta")
        }
        confirmVariant={pending?.kind === "charge" ? "primary" : "danger"}
        busy={
          pending?.kind === "revoke"
            ? acting
            : pending?.kind === "charge"
              ? charging
              : deleting
        }
        onConfirm={() =>
          pending?.kind === "revoke"
            ? revoke(pending.role)
            : pending?.kind === "charge"
              ? void directCharge()
              : void deleteUser()
        }
        onClose={() => setPending(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}

// ── Bloques de actividad por rol ────────────────────────────────────────

function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-ink/50">
      {children}
    </h4>
  );
}

function EmptyNote() {
  const t = useTranslations("admin");
  return <p className="text-sm text-ink/50">{t("users.roleData.empty")}</p>;
}

// Color semántico de status (skill ui-ux-principles §5): neon = vivo/ok,
// live = atención (en vivo o cancelado), outline = pendiente/borrador,
// muted = terminal neutro. Un color nunca cambia de significado.
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: "neon",      // ticket vigente
  USED: "neon",        // ticket consumido
  TRANSFERRED: "muted",
  CANCELLED: "live",
  PUBLISHED: "neon",
  LIVE: "live",
  CLOSED: "muted",
  DRAFT: "outline",
  REQUESTED: "outline",
  CONFIRMED: "neon",
};

// Segmento CRM con color semántico: los mejores destacan, el riesgo pide
// atención; NONE/nuevo quedan neutros.
const SEGMENT_VARIANT: Record<string, BadgeVariant> = {
  CORE: "neon",
  BRINGS_PEOPLE: "neon",
  NEW: "muted",
  AT_RISK: "live",
  NONE: "outline",
};

// Tipo de actor del score: academia destaca (institución), productor
// neutro. Mismas semánticas que el resto de chips de la página.
const ACTOR_TYPE_VARIANT: Record<string, BadgeVariant> = {
  ACADEMY: "neon",
  PRODUCER: "outline",
};

/** Badge de estado para tickets/eventos/arriendos; status desconocido se muestra crudo. */
function DataStatusBadge({
  kind,
  status,
}: {
  kind: "ticket" | "event" | "rental";
  status: string;
}) {
  const t = useTranslations("admin");
  const key = `users.roleData.status.${kind}.${status}`;
  return (
    <Badge variant={STATUS_VARIANT[status] ?? "outline"}>
      {t.has(key) ? t(key) : status}
    </Badge>
  );
}

/** Fila estándar de listas de actividad: nombre+contexto | valor+fecha+badge
    (proximidad: el dato que decide va junto al status en el bloque derecho). */
function DataRow({
  name,
  date,
  sub,
  value,
  badge,
}: {
  name: string;
  date?: string | null;
  sub?: string;
  value?: string;
  badge?: React.ReactNode;
}) {
  const locale = useLocale();
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 py-1">
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {sub && <span className="truncate text-xs text-ink/50">{sub}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {value && (
          <span className="text-sm font-semibold tabular-nums">{value}</span>
        )}
        {date && (
          <span className="text-xs text-ink/50">{fmtDate(date, locale)}</span>
        )}
        {badge}
      </span>
    </li>
  );
}

/** Mini-KPI inline: número primario + label secundario (stat strip de card).
    min-w-8 + text-right del valor: los labels arrancan siempre en la misma
    x aunque el número tenga 1 o 3 dígitos. */
function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      <span className="inline-block min-w-8 shrink-0 text-right text-sm font-semibold tabular-nums">
        {value}
      </span>
      <span className="truncate text-xs text-ink/50">{label}</span>
    </span>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">{children}</div>
  );
}

// Expand tras 5 filas por lista - mismo patrón que las fichas de
// /admin/academias/[id] (toggle centrado con el total).
const COLLAPSED_ROWS = 5;

function DataList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin");
  const [expanded, setExpanded] = useState(false);
  const rows = Children.toArray(children);
  const capped = rows.length > COLLAPSED_ROWS;
  return (
    <div className="flex flex-col gap-1">
      <SubTitle>{title}</SubTitle>
      {empty ? (
        <EmptyNote />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-ink/5">
            {expanded ? rows : rows.slice(0, COLLAPSED_ROWS)}
          </ul>
          {capped && (
            <Button
              variant="secondary"
              size="sm"
              className="self-center"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? t("users.roleData.showLess")
                : t("users.roleData.showAll", { count: rows.length })}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ── Métodos de pago por academia ─────────────────────────────────────

// Resumen público del método manual (los datos de una TRANSFER ya se le
// muestran al alumno en checkout: no hay secreto que proteger).
function manualMethodSub(m: ManualMethodRow): string | null {
  const d = m.details ?? {};
  const s = (k: string) => {
    const v = d[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  if (m.type === "TRANSFER") {
    return (
      [s("holder"), s("bank"), s("accountNumber")]
        .filter((x): x is string => !!x)
        .join(" · ") || null
    );
  }
  if (m.type === "PAYMENT_LINK") return s("url");
  if (m.type === "CASH") return s("instructions");
  return null;
}

function AcademyPayMethodsCard({ academy }: { academy: AcademyPayMethods }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const gatewayStatus = (s: string) => {
    const key = `users.payMethods.gatewayStatus.${s}`;
    return t.has(key) ? t(key) : s;
  };
  const methodType = (type: string) => {
    const key = `users.payMethods.methodType.${type}`;
    return t.has(key) ? t(key) : type;
  };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold">{academy.name}</h3>
      {academy.gatewayAccounts.length === 0 &&
      academy.manualMethods.length === 0 ? (
        <p className="text-sm text-ink/50">{t("users.payMethods.empty")}</p>
      ) : (
        <>
          {academy.gatewayAccounts.length > 0 && (
            <div className="flex flex-col gap-1">
              <SubTitle>{t("users.payMethods.gateway")}</SubTitle>
              <ul className="flex flex-col divide-y divide-ink/5">
                {academy.gatewayAccounts.map((g) => (
                  <li
                    key={g.id}
                    className="flex flex-col justify-center gap-0.5 py-1.5"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {g.provider}{" "}
                        <span className="font-mono text-xs text-ink/50">
                          {g.keyMask}
                        </span>
                      </span>
                      <Badge
                        variant={g.status === "ACTIVE" ? "neon" : "muted"}
                      >
                        {gatewayStatus(g.status)}
                      </Badge>
                    </span>
                    <span className="text-xs text-ink/50">
                      {g.verifiedAt
                        ? t("users.payMethods.verifiedAt", {
                            date: fmtDate(g.verifiedAt, locale),
                          })
                        : t("users.payMethods.unverified")}
                    </span>
                    <span className="break-all font-mono text-[11px] text-ink/40">
                      {g.webhookUrl}
                    </span>
                    {g.lastError && (
                      <span className="text-[11px] text-red-400/80">
                        {g.lastError}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {academy.manualMethods.length > 0 && (
            <div className="flex flex-col gap-1">
              <SubTitle>{t("users.payMethods.manual")}</SubTitle>
              <ul className="flex flex-col divide-y divide-ink/5">
                {academy.manualMethods.map((m) => (
                  <DataRow
                    key={m.id}
                    name={m.label}
                    sub={manualMethodSub(m) ?? undefined}
                    badge={
                      <>
                        <Badge variant="outline">{methodType(m.type)}</Badge>
                        <Badge variant={m.active ? "neon" : "muted"}>
                          {m.active
                            ? t("users.payMethods.active")
                            : t("users.payMethods.inactive")}
                        </Badge>
                      </>
                    }
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function RoleDataBody({ role, data }: { role: string; data: unknown }) {
  const clpFmt = useNumFmt({
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
  const fmtClp = (n: number) => clpFmt.format(n);
  const t = useTranslations("admin");

  switch (role) {
    case "DANCER": {
      const d = data as DancerData;
      return (
        <div className="flex flex-col gap-3">
          <StatRow>
            <Stat value={d.dancesCount} label={t("users.roleData.dances")} />
            <Stat value={d.checkinsCount} label={t("users.roleData.checkins")} />
          </StatRow>
          <DataList
            title={t("users.roleData.ticketsUpcoming")}
            empty={d.ticketsUpcoming.length === 0}
          >
            {d.ticketsUpcoming.map((tk) => (
              <DataRow
                key={tk.id}
                name={tk.event?.name ?? "·"}
                date={tk.event?.startsAt}
                value={fmtClp(tk.listPrice)}
                badge={<DataStatusBadge kind="ticket" status={tk.status} />}
              />
            ))}
          </DataList>
          <DataList
            title={t("users.roleData.ticketsPast")}
            empty={d.ticketsPast.length === 0}
          >
            {d.ticketsPast.map((tk) => (
              <DataRow
                key={tk.id}
                name={tk.event?.name ?? "·"}
                date={tk.event?.startsAt}
                value={fmtClp(tk.listPrice)}
                badge={<DataStatusBadge kind="ticket" status={tk.status} />}
              />
            ))}
          </DataList>
        </div>
      );
    }

    case "PRODUCER": {
      const d = data as ProducerData;
      const rows = (list: EventRow[]) =>
        list.map((e) => (
          <DataRow
            key={e.id}
            name={e.name}
            date={e.startsAt}
            badge={<DataStatusBadge kind="event" status={e.status} />}
          />
        ));
      return (
        <div className="flex flex-col gap-3">
          <DataList
            title={t("users.roleData.eventsUpcoming")}
            empty={d.eventsUpcoming.length === 0}
          >
            {rows(d.eventsUpcoming)}
          </DataList>
          <DataList
            title={t("users.roleData.eventsPast")}
            empty={d.eventsPast.length === 0}
          >
            {rows(d.eventsPast)}
          </DataList>
        </div>
      );
    }

    case "STAFF": {
      const d = data as StaffData;
      return (
        <DataList
          title={t("users.roleData.assignments")}
          empty={d.assignments.length === 0}
        >
          {d.assignments.map((a) => (
            <DataRow
              key={a.id}
              name={a.event?.name ?? "·"}
              date={a.event?.startsAt}
              sub={
                a.event?.producer
                  ? `${t("users.roleData.worksFor")}: ${a.event.producer.name}`
                  : undefined
              }
              badge={<Badge variant="muted">{a.role}</Badge>}
            />
          ))}
        </DataList>
      );
    }

    case "INSTRUCTOR": {
      const d = data as InstructorData;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <SubTitle>{t("users.roleData.academies")}</SubTitle>
            {d.academies.length === 0 ? (
              <EmptyNote />
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {d.academies.map((a) => (
                  <li key={a.id}>
                    <Badge variant="outline">{a.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DataList
            title={t("users.roleData.classesUpcoming")}
            empty={d.classesUpcoming.length === 0}
          >
            {d.classesUpcoming.map((c) => (
              <DataRow
                key={c.id}
                name={c.style ?? "·"}
                date={c.startsAt}
                sub={c.academy.name}
              />
            ))}
          </DataList>
          <StatRow>
            <Stat
              value={d.classesPastCount}
              label={t("users.roleData.classesPast")}
            />
          </StatRow>
        </div>
      );
    }

    case "ACADEMY_OWNER": {
      const d = data as AcademyOwnerData;
      return (
        <DataList
          title={t("users.roleData.academies")}
          empty={d.academies.length === 0}
        >
          {d.academies.map((a) => (
            <DataRow
              key={a.id}
              name={a.name}
              sub={`${t("users.roleData.students")}: ${a.studentsCount}`}
            />
          ))}
        </DataList>
      );
    }

    case "DJ": {
      const d = data as DjData;
      const rows = (list: GigRow[]) =>
        list.map((g) => (
          <DataRow key={g.id} name={g.event.name} date={g.event.startsAt} />
        ));
      return (
        <div className="flex flex-col gap-3">
          <DataList
            title={t("users.roleData.gigsUpcoming")}
            empty={d.gigsUpcoming.length === 0}
          >
            {rows(d.gigsUpcoming)}
          </DataList>
          <DataList
            title={t("users.roleData.gigsPast")}
            empty={d.gigsPast.length === 0}
          >
            {rows(d.gigsPast)}
          </DataList>
        </div>
      );
    }

    case "VENUE_MANAGER": {
      const d = data as VenueManagerData;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <SubTitle>{t("users.roleData.venues")}</SubTitle>
            {d.venues.length === 0 ? (
              <EmptyNote />
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {d.venues.map((v) => (
                  <li key={v.id}>
                    <Badge variant="outline">{v.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DataList
            title={t("users.roleData.rentals")}
            empty={d.rentals.length === 0}
          >
            {d.rentals.map((r) => (
              <DataRow
                key={r.id}
                name={r.venue.name}
                date={r.date}
                badge={<DataStatusBadge kind="rental" status={r.status} />}
              />
            ))}
          </DataList>
        </div>
      );
    }

    default:
      // Roles sin bloque propio (SUPPORT, ADMIN, customs) → data = {}.
      return <EmptyNote />;
  }
}
