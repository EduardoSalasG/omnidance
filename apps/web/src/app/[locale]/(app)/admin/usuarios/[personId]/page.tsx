"use client";

import { Children, useCallback, useEffect, useState, use } from "react";

import {useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, ClockIcon, ConfirmSheet, RefreshIcon, type BadgeVariant } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
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
  const [catalog, setCatalog] = useState<RoleRow[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [actionError, setActionError] = useState(false);
  const [acting, setActing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Confirmación compartida (revocar rol o hard-delete de la cuenta).
  const [pending, setPending] = useState<
    { kind: "revoke"; role: string } | { kind: "delete" } | null
  >(null);
  const router = useRouter();
  const [newRole, setNewRole] = useState("");

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

  // Catálogo de roles para el selector "Agregar rol" (y fallback de label
  // para roles custom sin entrada en profile.roleLabels).
  useEffect(() => {
    apiFetch("/admin/roles")
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        setCatalog((await res.json()) as RoleRow[]);
      })
      .catch(() => setActionError(true));
  }, []);

  // Toda mutación de rol pasa por aquí: serializa acciones, reporta error
  // y recarga la ficha (roleData cambia según los roles poseídos).
  async function mutateRole(call: () => Promise<Response>) {
    if (acting) return;
    setActing(true);
    setActionError(false);
    try {
      const res = await call();
      if (!res.ok) {
        setActionError(true);
        return;
      }
      setNewRole("");
      await load();
    } catch {
      setActionError(true);
    } finally {
      setActing(false);
    }
  }

  const setStatus = (role: string, status: string) =>
    void mutateRole(() =>
      apiFetch(`/admin/users/${personId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, status }),
      }),
    );

  const revoke = (role: string) => {
    void mutateRole(() =>
      apiFetch(`/admin/users/${personId}/roles/${role}`, {
        method: "DELETE",
      }),
    ).finally(() => setPending(null));
  };

  const addRole = () => {
    if (!newRole) return;
    void mutateRole(() =>
      apiFetch(`/admin/users/${personId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, status: "APPROVED" }),
      }),
    );
  };

  // Hard delete en cascada (DELETE /admin/users/:personId) - pensado
  // para cuentas de prueba/duplicadas; auditado server-side.
  async function deleteUser() {
    if (!detail || deleting) return;
    setDeleting(true);
    setActionError(false);
    try {
      const res = await apiFetch(`/admin/users/${personId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setPending(null);
        setActionError(true);
        setDeleting(false);
        return;
      }
      router.push("/admin/usuarios");
    } catch {
      setPending(null);
      setActionError(true);
      setDeleting(false);
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
          {tc("error")}
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

      <Button
        href={`/analitica/usuarios/${personId}`}
        variant="secondary"
        className="self-start"
      >
        {t("users.viewAnalytics")}
      </Button>

      {/* Zona de peligro - hard delete en cascada, auditado */}
      <Card className="flex flex-col gap-3 border-red-500/40">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400/80">
          {t("users.delete.title")}
        </h2>
        <p className="text-sm text-ink/60">{t("users.delete.body")}</p>
        <Button
          variant="secondary"
          onClick={() => setPending({ kind: "delete" })}
          disabled={deleting}
          className="self-start border-red-500/50 text-red-300 hover:bg-red-500/10"
        >
          {deleting ? tc("loading") : t("users.delete.cta")}
        </Button>
      </Card>

      <ConfirmSheet
        open={pending !== null}
        title={
          pending?.kind === "revoke"
            ? t("users.revokeConfirm", { role: roleLabel(pending.role) })
            : t("users.delete.confirm", { name: detail.person.name })
        }
        confirmLabel={
          pending?.kind === "revoke"
            ? t("users.revoke")
            : t("users.delete.cta")
        }
        busy={pending?.kind === "revoke" ? acting : deleting}
        onConfirm={() =>
          pending?.kind === "revoke"
            ? revoke(pending.role)
            : void deleteUser()
        }
        onClose={() => setPending(null)}
      />
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
