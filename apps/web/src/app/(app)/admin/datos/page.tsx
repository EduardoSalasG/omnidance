"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PillTabs,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";
import { FilterBar, type QueryOption } from "@/components/query/FilterBar";
import {
  SavedQueries,
  type SavedQuery,
} from "@/components/query/SavedQueries";
import type {
  EntityDef,
  QueryFilters,
  SavedReportParams,
} from "@omnidance/shared";

// ── /admin/datos sobre el query engine (spec analytics/query-console, D5+D6)
// Entidades y filtros vienen del catálogo compartido
// (GET /query/catalog?role=ADMIN - fuente de verdad de lo consultable);
// las filas se siguen pidiendo a /admin/browse/:entity (shape `objects`
// con acciones por fila - convert lead, payloads, verify-chain) con los
// mismos params que declara el catálogo. Encima: export CSV/PDF de
// /query/export.* y consultas guardadas de /query/saved (lente ADMIN).

type Ref = { id: string; name: string } | null;

type EventRow = {
  id: string;
  name: string;
  startsAt: string;
  status: string;
  producer: Ref;
  venue: Ref;
  sold: number;
};
type ClassRow = {
  id: string;
  startsAt: string;
  cancelled: boolean;
  style: Ref;
  academy: Ref;
  instructor: Ref;
  booked: number;
  capacity: number;
};
type PaymentRow = {
  id: string;
  amount: number;
  net: number;
  status: string;
  orderType: string;
  createdAt: string;
  person: Ref;
  event: Ref;
};
type TicketRow = {
  id: string;
  status: string;
  listPrice: number;
  event: { id: string; name: string; startsAt: string } | null;
  owner: Ref;
};
type AcademyRow = { id: string; name: string; students: number; seriesActive: number };
type VenueRow = { id: string; name: string; address: string | null; rentalsCount: number };
type RentalRow = { id: string; date: string; status: string; venue: Ref; event: Ref };
type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  isDemoAccount?: boolean;
  createdAt: string;
  roles: { id: string; role: string; status: string; createdAt: string }[];
};
type LeadRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: string[];
  intent: string;
  status: string;
  personId: string | null;
  demoPending?: boolean;
  createdAt: string;
};
// Ledger append-only del pago (payload/prevHash/payloadHash completos -
// la evidencia que verify-chain recalcula).
type PaymentEventRow = {
  id: string;
  paymentId: string;
  seq: number;
  type: string;
  actor: string;
  prevHash: string;
  payloadHash: string;
  payload: unknown;
  createdAt: string;
};
type GatewayTxRow = {
  id: string;
  provider: string;
  direction: string;
  endpoint: string;
  correlationId: string;
  requestBody: unknown;
  responseBody: unknown;
  httpStatus: number | null;
  durationMs: number | null;
  ok: boolean;
  error: string | null;
  paymentId: string | null;
  createdAt: string;
};
type SubscriptionRow = {
  id: string;
  status: string;
  flowSubscriptionId: string | null;
  nextInvoiceAt: string | null;
  lastInvoiceId: string | null;
  canceledAt: string | null;
  createdAt: string;
  plan: { id: string; name: string } | null;
  person: Ref;
  academy: Ref;
};
// Shape `objects` de la entidad payouts del engine (admin actor resuelto
// a {id,name} según actorType).
type PayoutRow = {
  id: string;
  actorType: string;
  actor: Ref;
  periodStart: string;
  periodEnd: string;
  gross: number;
  platformFee: number;
  net: number;
  status: string;
  paidAt: string | null;
};

type CatalogResponse = {
  entities: EntityDef[];
  options: Record<string, QueryOption[]>;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });
const dateTimeFmt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PUBLISHED: "neon",
  LIVE: "live",
  PAID: "neon",
  CONFIRMED: "neon",
  ACTIVE: "neon",
  APPROVED: "neon",
  CANCELLED: "outline",
  REFUNDED: "outline",
  FAILED: "live",
  OK: "neon",
  ERROR: "live",
};

/**
 * /admin/datos - explorador operacional sobre el catálogo de consultas:
 * las pills son las entidades del lente ADMIN, la barra de filtros es la
 * compartida (FilterBar, auto-aplicada) y el listado interactivo sigue
 * saliendo de GET /admin/browse/:entity (objects, cap 100). Export
 * CSV/PDF va por /query/export.* y las guardadas por /query/saved.
 */
export default function AdminDatosPage() {
  const t = useTranslations("admin");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <DatosPanel />
      </AdminGate>
    </main>
  );
}

function DatosPanel() {
  const t = useTranslations("admin");
  const ta = useTranslations("analytics");
  const tp = useTranslations("profile");
  const tc = useTranslations("common");
  const tq = useTranslations("query");

  // ── Catálogo del lente ADMIN (entidades habilitadas + opciones FK) ───
  const [catalogPhase, setCatalogPhase] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [entities, setEntities] = useState<EntityDef[]>([]);
  const [options, setOptions] = useState<Record<string, QueryOption[]>>({});

  const [entity, setEntity] = useState<string>("");
  const [filters, setFilters] = useState<QueryFilters>({});

  const [rows, setRows] = useState<unknown[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  // Lead en conversión - deshabilita su botón mientras el POST corre.
  const [convertingLead, setConvertingLead] = useState<string | null>(null);
  // Verify-chain por pago: id en vuelo + último resultado por paymentId.
  const [verifying, setVerifying] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<
    Record<string, { ok: boolean; events: number; firstBadSeq?: number }>
  >({});

  // ── Consultas guardadas del lente ────────────────────────────────────
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [savedBusy, setSavedBusy] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const statusLabel = (s: string) =>
    ta.has(`statusLabels.${s}`) ? ta(`statusLabels.${s}`) : s;
  const orderLabel = (s: string) =>
    ta.has(`orderTypes.${s}`) ? ta(`orderTypes.${s}`) : s;
  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const actorTypeLabel = (s: string) =>
    tq.has(`optionLabels.${s}`) ? tq(`optionLabels.${s}`) : s;

  const loadCatalog = useCallback(async () => {
    setCatalogPhase("loading");
    try {
      const res = await apiFetch("/query/catalog?role=ADMIN");
      if (!res.ok) return setCatalogPhase("error");
      const data = (await res.json()) as CatalogResponse;
      const list = data.entities ?? [];
      setEntities(list);
      setOptions(data.options ?? {});
      setEntity((prev) =>
        prev && list.some((e) => e.entity === prev)
          ? prev
          : (list[0]?.entity ?? ""),
      );
      setCatalogPhase("ready");
    } catch {
      setCatalogPhase("error");
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  // ── Fetch de resultados (auto-aplica al cambiar filtros/entidad) ────
  // Los nombres de filtro del catálogo son los params de /admin/browse.
  const load = useCallback(async () => {
    if (!entity) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    setPhase("loading");
    try {
      const res = await apiFetch(
        `/admin/browse/${entity}?${params.toString()}`,
      );
      if (!res.ok) return setPhase("error");
      setRows((await res.json()) as unknown[]);
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, [entity, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Consultas guardadas (GET/POST/PATCH/DELETE /query/saved) ────────
  const loadSaved = useCallback(async () => {
    try {
      const res = await apiFetch("/query/saved?role=ADMIN");
      if (!res.ok) return;
      const data = (await res.json()) as { saved?: SavedQuery[] };
      setSaved(data.saved ?? []);
    } catch {
      // Lista auxiliar - si falla queda la del estado previo.
    }
  }, []);

  useEffect(() => {
    if (catalogPhase === "ready") void loadSaved();
  }, [catalogPhase, loadSaved]);

  async function saveCurrent() {
    const name = saveName.trim();
    if (!name || !entity || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      const res = await apiFetch("/query/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: "ADMIN",
          name,
          params: { entity, filters } satisfies SavedReportParams,
        }),
      });
      if (res.ok) {
        setSaveName("");
        setNotice(tq("saved.created"));
        void loadSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  async function renameSaved(id: string, name: string) {
    setSavedBusy(id);
    try {
      const res = await apiFetch(`/query/saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await loadSaved();
    } finally {
      setSavedBusy(null);
    }
  }

  async function deleteSaved(id: string) {
    setSavedBusy(id);
    try {
      const res = await apiFetch(`/query/saved/${id}`, { method: "DELETE" });
      if (res.ok) await loadSaved();
    } finally {
      setSavedBusy(null);
    }
  }

  // Plantilla/guardada seleccionada: precarga entidad + filtros (la lista
  // se re-carga sola por el efecto sobre `filters`/`entity`).
  function applyParams(params: SavedReportParams) {
    if (!entities.some((e) => e.entity === params.entity)) return;
    setEntity(params.entity);
    setFilters({ ...params.filters });
  }

  function selectEntity(e: string) {
    setEntity(e);
    setFilters({});
  }

  // Export completo (sin cap) - <a download> por el proxy same-origin.
  function exportHref(format: "csv" | "pdf"): string {
    const params = new URLSearchParams({ role: "ADMIN", entity });
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return `/api/query/export.${format}?${params.toString()}`;
  }

  // Convierte el lead en usuario real: crea/enlaza la Person en modo
  // pendiente y le envía magic link + notificación para completar datos.
  async function convertLead(leadId: string) {
    setConvertingLead(leadId);
    try {
      const res = await apiFetch(`/admin/leads/${leadId}/convert`, {
        method: "POST",
      });
      if (res.ok) await load();
    } finally {
      setConvertingLead(null);
    }
  }

  // Re-calcula el hash-chain del ledger del pago (GET verify-chain) y
  // muestra integridad en la propia fila - evidencia anti-tamper.
  async function verifyChain(paymentId: string) {
    setVerifying(paymentId);
    try {
      const res = await apiFetch(`/admin/payments/${paymentId}/verify-chain`);
      if (res.ok) {
        const data = (await res.json()) as {
          ok: boolean;
          events: number;
          firstBadSeq?: number;
        };
        setChainResult((prev) => ({ ...prev, [paymentId]: data }));
      }
    } finally {
      setVerifying(null);
    }
  }

  // ── Render de filas por entidad ───────────────────────────────────────

  const meta = (text: string) => (
    <span className="text-xs text-ink/50">{text}</span>
  );

  function renderRow(row: unknown, i: number) {
    switch (entity) {
      case "events": {
        const r = row as EventRow;
        return (
          <RowShell
            key={r.id}
            title={r.name}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              dateTimeFmt.format(new Date(r.startsAt)),
              r.producer?.name,
              r.venue?.name,
            ]}
            tail={`${num.format(r.sold)} ${t("datos.cols.sold").toLowerCase()}`}
          />
        );
      }
      case "classes": {
        const r = row as ClassRow;
        return (
          <RowShell
            key={r.id}
            title={r.style?.name ?? t("datos.entity.classes")}
            badge={r.cancelled ? "CANCELLED" : undefined}
            badgeLabel={r.cancelled ? statusLabel("CANCELLED") : undefined}
            meta={[
              dateTimeFmt.format(new Date(r.startsAt)),
              r.academy?.name,
              r.instructor?.name,
            ]}
            tail={`${num.format(r.booked)}/${num.format(r.capacity)}`}
          />
        );
      }
      case "payments": {
        const r = row as PaymentRow;
        const chain = chainResult[r.id];
        return (
          <RowShell
            key={r.id}
            title={clp.format(r.amount)}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              orderLabel(r.orderType),
              r.person?.name,
              r.event?.name,
              dateTimeFmt.format(new Date(r.createdAt)),
            ]}
            tail={`${t("datos.cols.net")}: ${clp.format(r.net)}`}
            action={
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={verifying === r.id}
                  onClick={() => void verifyChain(r.id)}
                  className="inline-flex min-h-9 items-center gap-2 self-start rounded-full border border-ink/20 px-3.5 text-xs font-semibold text-ink/70 transition-colors hover:bg-ink/10 active:scale-[0.97] disabled:opacity-60"
                >
                  {verifying === r.id && <Spinner size="sm" />}
                  {t("datos.verifyChain")}
                </button>
                {chain &&
                  (chain.ok ? (
                    <span className="text-xs font-medium text-neon">
                      {t("datos.chainOk", { events: chain.events })}
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-red-400">
                      {t("datos.chainBroken", {
                        seq: chain.firstBadSeq ?? 0,
                      })}
                    </span>
                  ))}
              </span>
            }
          />
        );
      }
      case "tickets": {
        const r = row as TicketRow;
        return (
          <RowShell
            key={r.id}
            title={r.event?.name ?? r.id.slice(0, 8)}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              r.event ? dateFmt.format(new Date(r.event.startsAt)) : null,
              r.owner?.name,
            ]}
            tail={clp.format(r.listPrice)}
          />
        );
      }
      case "academies": {
        const r = row as AcademyRow;
        return (
          <RowShell
            key={r.id}
            title={r.name}
            meta={[]}
            tail={`${num.format(r.students)} ${t("datos.cols.students").toLowerCase()} · ${num.format(r.seriesActive)} ${t("datos.cols.series").toLowerCase()}`}
          />
        );
      }
      case "venues": {
        const r = row as VenueRow;
        return (
          <RowShell
            key={r.id}
            title={r.name}
            meta={[r.address]}
            tail={`${num.format(r.rentalsCount)} ${t("datos.cols.rentals").toLowerCase()}`}
          />
        );
      }
      case "rentals": {
        const r = row as RentalRow;
        return (
          <RowShell
            key={r.id}
            title={r.venue?.name ?? r.id.slice(0, 8)}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[dateFmt.format(new Date(r.date)), r.event?.name]}
          />
        );
      }
      case "people": {
        const r = row as PersonRow;
        return (
          <li key={r.id}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {r.name}
                </p>
                <span className="shrink-0 text-xs text-ink/40">
                  {dateFmt.format(new Date(r.createdAt))}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {r.email && meta(r.email)}
                {r.isDemoAccount && (
                  <Badge variant="outline">{t("datos.demoBadge")}</Badge>
                )}
              </div>
              {r.roles.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {r.roles.map((rol) => (
                    <li key={rol.id}>
                      <Badge
                        variant={
                          rol.status === "APPROVED" ? "neon" : "outline"
                        }
                      >
                        {roleLabel(rol.role)}
                        {rol.status !== "APPROVED" &&
                          ` · ${statusLabel(rol.status)}`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </li>
        );
      }
      case "leads": {
        const r = row as LeadRow;
        // Convertible si aún no tiene cuenta o la ligada sigue en demo.
        const convertible = !r.personId || r.demoPending;
        return (
          <RowShell
            key={r.id}
            title={r.name}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              r.email,
              r.phone,
              r.roles.map(roleLabel).join(", "),
              statusLabel(r.intent),
              r.personId ? t("datos.leadConverted") : null,
            ]}
            tail={dateTimeFmt.format(new Date(r.createdAt))}
            action={
              convertible && r.status !== "DISCARDED" ? (
                <button
                  type="button"
                  disabled={convertingLead === r.id}
                  onClick={() => void convertLead(r.id)}
                  className="mt-1 inline-flex min-h-9 items-center gap-2 self-start rounded-full border border-neon/40 px-3.5 text-xs font-semibold text-neon transition-colors hover:bg-neon/10 active:scale-[0.97] disabled:opacity-60"
                >
                  {convertingLead === r.id && <Spinner size="sm" />}
                  {t("datos.convertLead")}
                </button>
              ) : null
            }
          />
        );
      }
      case "payment-events": {
        const r = row as PaymentEventRow;
        return (
          <RowShell
            key={r.id}
            title={r.type}
            meta={[
              `#${r.seq} · ${r.actor}`,
              t("datos.audit.paymentRef", { id: r.paymentId.slice(0, 8) }),
              dateTimeFmt.format(new Date(r.createdAt)),
            ]}
            tail={t("datos.audit.hash", {
              id: `${r.payloadHash.slice(0, 12)}…`,
            })}
            action={
              <JsonDetails label={t("datos.audit.payload")} value={r.payload} />
            }
          />
        );
      }
      case "gateway-transactions": {
        const r = row as GatewayTxRow;
        return (
          <RowShell
            key={r.id}
            title={r.endpoint}
            badge={r.ok ? "OK" : "ERROR"}
            badgeLabel={
              r.ok
                ? t("datos.optionLabels.true")
                : t("datos.optionLabels.false")
            }
            meta={[
              t.has(`datos.optionLabels.${r.direction}`)
                ? t(`datos.optionLabels.${r.direction}`)
                : r.direction,
              r.httpStatus != null ? `HTTP ${r.httpStatus}` : null,
              r.durationMs != null
                ? t("datos.audit.duration", { ms: r.durationMs })
                : null,
              r.paymentId
                ? t("datos.audit.paymentRef", {
                    id: r.paymentId.slice(0, 8),
                  })
                : null,
              t("datos.audit.corrRef", {
                id: r.correlationId.slice(0, 8),
              }),
              dateTimeFmt.format(new Date(r.createdAt)),
            ]}
            tail={r.error ?? undefined}
            action={
              <>
                <JsonDetails
                  label={t("datos.audit.request")}
                  value={r.requestBody}
                />
                <JsonDetails
                  label={t("datos.audit.response")}
                  value={r.responseBody}
                />
              </>
            }
          />
        );
      }
      case "membership-subscriptions": {
        const r = row as SubscriptionRow;
        return (
          <RowShell
            key={r.id}
            title={r.person?.name ?? r.id.slice(0, 8)}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              r.academy?.name,
              r.plan?.name,
              r.nextInvoiceAt
                ? t("datos.audit.nextInvoice", {
                    date: dateFmt.format(new Date(r.nextInvoiceAt)),
                  })
                : null,
              r.canceledAt
                ? t("datos.audit.canceledAt", {
                    date: dateFmt.format(new Date(r.canceledAt)),
                  })
                : null,
              dateTimeFmt.format(new Date(r.createdAt)),
            ]}
            tail={
              r.flowSubscriptionId
                ? t("datos.audit.flowRef", { id: r.flowSubscriptionId })
                : undefined
            }
          />
        );
      }
      case "payouts": {
        const r = row as PayoutRow;
        return (
          <RowShell
            key={r.id}
            title={r.actor?.name ?? r.id.slice(0, 8)}
            badge={r.status}
            badgeLabel={statusLabel(r.status)}
            meta={[
              actorTypeLabel(r.actorType),
              `${dateFmt.format(new Date(r.periodStart))} – ${dateFmt.format(new Date(r.periodEnd))}`,
              r.paidAt
                ? t("datos.payoutPaidAt", {
                    date: dateFmt.format(new Date(r.paidAt)),
                  })
                : null,
            ]}
            tail={`${t("datos.cols.net")}: ${clp.format(r.net)}`}
          />
        );
      }
      default:
        return <li key={i} />;
    }
  }

  // Sin q ni rol, people devuelve [] por diseño - mostrar el hint en vez
  // de un vacío ambiguo.
  const peopleNeedsQuery =
    entity === "people" &&
    !filters.role &&
    (filters.q ?? "").trim().length < 2;

  const entityDef =
    entities.find((e) => e.entity === entity) ?? undefined;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink/60">{t("datos.subtitle")}</p>

      {catalogPhase === "loading" && <SkeletonList />}

      {catalogPhase === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <button
            type="button"
            onClick={() => void loadCatalog()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink/10 px-4 text-sm font-semibold text-ink/70"
          >
            <RefreshIcon /> {tc("retry")}
          </button>
        </div>
      )}

      {catalogPhase === "ready" && entities.length > 0 && (
        <>
          <PillTabs
            ariaLabel={t("datos.title")}
            active={entity}
            onSelect={selectEntity}
            items={entities.map((e) => ({
              key: e.entity,
              label: tq.has(`entities.${e.entity}`)
                ? tq(`entities.${e.entity}`)
                : e.entity,
            }))}
          />

          {entityDef && (
            <FilterBar
              entity={entityDef}
              filters={filters}
              onChange={setFilters}
              options={options}
            />
          )}

          {/* Export del resultado completo + guardar la consulta actual. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex gap-2">
              {(["csv", "pdf"] as const).map((f) => (
                <a
                  key={f}
                  href={exportHref(f)}
                  download
                  className={`inline-flex min-h-11 min-w-16 items-center justify-center rounded-xl border px-4 text-xs font-bold uppercase tracking-wide transition-colors ${
                    f === "csv"
                      ? "border-line bg-surface text-ink hover:border-neon/60"
                      : "border-neon/40 bg-neon/10 text-neon hover:border-neon/70"
                  }`}
                >
                  {f}
                </a>
              ))}
            </span>
            <span className="ms-auto flex min-w-0 flex-1 gap-2 sm:flex-none">
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={tq("savePlaceholder")}
                aria-label={tq("savePlaceholder")}
                className={`${inputCls} min-w-0 flex-1 sm:w-56`}
              />
              <Button
                size="sm"
                variant="secondary"
                className="shrink-0"
                onClick={() => void saveCurrent()}
                disabled={!saveName.trim() || saving || !entity}
              >
                {saving ? <Spinner size="sm" /> : null}
                {tq("save")}
              </Button>
            </span>
          </div>

          <div aria-live="polite">
            {notice && (
              <p role="status" className="text-sm font-medium text-neon">
                {notice}
              </p>
            )}
          </div>

          <SavedQueries
            role="ADMIN"
            saved={saved}
            busyId={savedBusy}
            onSelect={applyParams}
            onRename={(id, name) => void renameSaved(id, name)}
            onDelete={(id) => void deleteSaved(id)}
          />

          {phase === "error" && (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink/10 px-4 text-sm font-semibold text-ink/70"
              >
                <RefreshIcon /> {tc("retry")}
              </button>
            </div>
          )}

          {phase === "loading" && rows === null && <SkeletonList />}
          {phase === "loading" && rows !== null && (
            <p role="status" className="page-loading text-sm text-ink/50">
              {tc("loading")}
            </p>
          )}

          {phase === "ready" && rows !== null && (
            <>
              {peopleNeedsQuery ? (
                <p className="text-sm text-ink/50">{t("users.searchHint")}</p>
              ) : rows.length === 0 ? (
                <Card className="py-6 text-center">
                  <p className="text-sm text-ink/70">{t("datos.empty")}</p>
                </Card>
              ) : (
                <ul className="flex flex-col gap-3">{rows.map(renderRow)}</ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Card de resultado: título + badge de estado + línea meta + dato final. */
function RowShell({
  title,
  badge,
  badgeLabel,
  meta,
  tail,
  action,
}: {
  title: string;
  badge?: string;
  badgeLabel?: string;
  meta: (string | null | undefined)[];
  tail?: string;
  action?: ReactNode;
}) {
  const metaParts = meta.filter((m): m is string => !!m);
  return (
    <li>
      <Card className="flex min-h-[44px] flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
          {badge && badgeLabel && (
            <Badge variant={STATUS_VARIANT[badge] ?? "muted"}>
              {badgeLabel}
            </Badge>
          )}
        </div>
        {metaParts.length > 0 && (
          <p className="truncate text-xs text-ink/50">
            {metaParts.join(" · ")}
          </p>
        )}
        {tail && (
          <p className="text-xs font-medium tabular-nums text-ink/70">
            {tail}
          </p>
        )}
        {action}
      </Card>
    </li>
  );
}

/**
 * Payload JSON expandible - el browse no tenía renderer para columnas
 * Json (payment-events.payload, gateway request/response): <details>
 * nativo con el JSON pretty-printed truncado por scroll.
 */
function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="mt-1">
      <summary className="w-fit cursor-pointer text-xs font-medium text-ink/50 transition-colors hover:text-ink/80">
        {label}
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-canvas/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-ink/60">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
