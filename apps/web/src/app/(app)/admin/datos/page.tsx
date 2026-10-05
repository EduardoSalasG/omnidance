"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card, PillTabs, type BadgeVariant, RefreshIcon } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonList } from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";

// ── Contrato GET /admin/browse/:entity (BrowseController) ──────────────

type Entity =
  | "events"
  | "classes"
  | "payments"
  | "tickets"
  | "academies"
  | "venues"
  | "rentals"
  | "people"
  | "leads"
  | "payment-events"
  | "gateway-transactions"
  | "membership-subscriptions";

const ENTITIES: Entity[] = [
  "events",
  "classes",
  "payments",
  "tickets",
  "academies",
  "venues",
  "rentals",
  "people",
  "leads",
  "payment-events",
  "gateway-transactions",
  "membership-subscriptions",
];

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
// Ledger append-only del pago (payload/prevHash/payloadHash completos —
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

// ── Filtros soportados por entidad (whitelist del controller) ──────────

const EVENT_STATUSES = ["DRAFT", "PUBLISHED", "LIVE", "CLOSED", "CANCELLED"];
const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];
const ORDER_TYPES = [
  "TICKET",
  "SERIES_PASS",
  "MEMBERSHIP",
  "PRIVATE_LESSON",
  "WORKSHOP",
];
const TICKET_STATUSES = ["ACTIVE", "USED", "CANCELLED", "TRANSFERRED"];
const RENTAL_STATUSES = ["REQUESTED", "CONFIRMED", "CANCELLED"];
const LEAD_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "DISCARDED"];
const LEAD_INTENTS = ["CONTACT", "DEMO"];
// Whitelists del controller para las entidades de auditoría (el resto
// de sus filtros son texto libre: paymentId, actor, endpoint…).
const GATEWAY_DIRECTIONS = ["OUTBOUND", "INBOUND_WEBHOOK"];
const GATEWAY_OK = ["true", "false"];
const SUBSCRIPTION_STATUSES = [
  "PENDING_CARD",
  "ACTIVATING",
  "ACTIVE",
  "CANCEL_PENDING",
  "CANCELED",
  "FAILED_CARD",
];

type Option = { value: string; label: string };

// Fuentes de opciones para selects FK — listados admin ya existentes.
type OptionSource =
  | "producers"
  | "venues"
  | "academies"
  | "styles"
  | "events"
  | "roles";

const FILTER_SOURCES: Record<Entity, Partial<Record<string, OptionSource>>> = {
  events: { producerId: "producers", venueId: "venues" },
  classes: { academyId: "academies", styleId: "styles" },
  tickets: { eventId: "events" },
  rentals: { venueId: "venues" },
  people: { role: "roles" },
  payments: {},
  academies: {},
  venues: {},
  leads: {},
  "payment-events": {},
  "gateway-transactions": {},
  "membership-subscriptions": { academyId: "academies" },
};

const STATIC_OPTIONS: Record<string, string[]> = {
  "events.status": EVENT_STATUSES,
  "payments.status": PAYMENT_STATUSES,
  "payments.orderType": ORDER_TYPES,
  "tickets.status": TICKET_STATUSES,
  "rentals.status": RENTAL_STATUSES,
  "leads.status": LEAD_STATUSES,
  "leads.intent": LEAD_INTENTS,
  "gateway-transactions.direction": GATEWAY_DIRECTIONS,
  "gateway-transactions.ok": GATEWAY_OK,
  "membership-subscriptions.status": SUBSCRIPTION_STATUSES,
};

// Claves de filtro → param del query string que entiende el controller.
const ENTITY_PARAMS: Record<Entity, string[]> = {
  events: ["q", "status", "from", "to", "producerId", "venueId"],
  classes: ["academyId", "styleId", "from", "to"],
  payments: ["status", "orderType", "from", "to"],
  tickets: ["status", "eventId"],
  academies: ["q"],
  venues: ["q"],
  rentals: ["status", "venueId"],
  people: ["q", "role"],
  leads: ["q", "status", "intent", "from", "to"],
  "payment-events": ["paymentId", "type", "actor", "from", "to"],
  "gateway-transactions": [
    "paymentId",
    "correlationId",
    "endpoint",
    "direction",
    "ok",
    "from",
    "to",
  ],
  "membership-subscriptions": [
    "personId",
    "academyId",
    "status",
    "from",
    "to",
  ],
};

const HAS_Q = new Set<Entity>(["events", "academies", "venues", "people", "leads"]);
const HAS_DATES = new Set<Entity>([
  "events",
  "classes",
  "payments",
  "leads",
  "payment-events",
  "gateway-transactions",
  "membership-subscriptions",
]);

const DEBOUNCE_MS = 300;

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
  CANCELLED: "outline",
  REFUNDED: "outline",
  FAILED: "live",
  OK: "neon",
  ERROR: "live",
};

/**
 * /admin/datos — explorador operacional por categoría sobre
 * GET /admin/browse/:entity. Las pills cambian de entidad; los filtros
 * se aplican solos (q con debounce, selects/fechas al cambiar) y el API
 * capa el resultado en 100 filas.
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

  const [entity, setEntity] = useState<Entity>("events");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [fkOptions, setFkOptions] = useState<Record<string, Option[]>>({});

  const [rows, setRows] = useState<unknown[] | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  // Lead en conversión — deshabilita su botón mientras el POST corre.
  const [convertingLead, setConvertingLead] = useState<string | null>(null);

  const statusLabel = (s: string) =>
    ta.has(`statusLabels.${s}`) ? ta(`statusLabels.${s}`) : s;
  const orderLabel = (s: string) =>
    ta.has(`orderTypes.${s}`) ? ta(`orderTypes.${s}`) : s;
  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;

  // ── Opciones de selects FK ────────────────────────────────────────────

  const loadSource = useCallback(
    async (source: OptionSource): Promise<Option[]> => {
      switch (source) {
        case "producers": {
          const res = await apiFetch("/admin/browse/people?role=PRODUCER");
          if (!res.ok) return [];
          const list = (await res.json()) as { id: string; name: string }[];
          return list.map((p) => ({ value: p.id, label: p.name }));
        }
        case "venues": {
          const res = await apiFetch("/admin/browse/venues");
          if (!res.ok) return [];
          const list = (await res.json()) as VenueRow[];
          return list.map((v) => ({ value: v.id, label: v.name }));
        }
        case "academies": {
          const res = await apiFetch("/admin/browse/academies");
          if (!res.ok) return [];
          const list = (await res.json()) as AcademyRow[];
          return list.map((a) => ({ value: a.id, label: a.name }));
        }
        case "styles": {
          const res = await apiFetch("/admin/catalogs/styles");
          if (!res.ok) return [];
          const list = (await res.json()) as { id: string; name: string }[];
          return list.map((s) => ({ value: s.id, label: s.name }));
        }
        case "events": {
          const res = await apiFetch("/admin/browse/events");
          if (!res.ok) return [];
          const list = (await res.json()) as EventRow[];
          return list.map((e) => ({
            value: e.id,
            label: `${e.name} · ${dateFmt.format(new Date(e.startsAt))}`,
          }));
        }
        case "roles": {
          const res = await apiFetch("/admin/roles");
          if (!res.ok) return [];
          const list = (await res.json()) as { key: string; label: string }[];
          return list.map((r) => ({ value: r.key, label: r.label }));
        }
      }
    },
    [],
  );

  // Carga perezosa: solo las fuentes que la entidad activa necesita.
  useEffect(() => {
    const sources = Object.values(FILTER_SOURCES[entity]).filter(
      (s): s is OptionSource => !!s,
    );
    for (const source of sources) {
      if (fkOptions[source]) continue;
      void loadSource(source).then((opts) =>
        setFkOptions((prev) =>
          prev[source] ? prev : { ...prev, [source]: opts },
        ),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, loadSource]);

  // ── Fetch de resultados ───────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    for (const key of ENTITY_PARAMS[entity]) {
      const value = key === "q" ? debouncedQ : (filters[key] ?? "");
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
  }, [entity, debouncedQ, filters]);

  useEffect(() => {
    void load();
  }, [load]);

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

  function selectEntity(e: string) {
    setEntity(e as Entity);
    setQ("");
    setDebouncedQ("");
    setFilters({});
  }

  function setFilter(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  // ── UI helpers ────────────────────────────────────────────────────────

  const filterLabel = (key: string): string => {
    const map: Record<string, string> = {
      status: t("datos.filters.status"),
      orderType: t("datos.filters.orderType"),
      producerId: t("datos.filters.producer"),
      venueId: t("datos.filters.venue"),
      academyId: t("datos.filters.academy"),
      styleId: t("datos.filters.style"),
      eventId: t("datos.filters.event"),
      role: t("datos.filters.role"),
      intent: t("datos.filters.intent"),
      paymentId: t("datos.filters.paymentId"),
      personId: t("datos.filters.personId"),
      type: t("datos.filters.type"),
      actor: t("datos.filters.actor"),
      endpoint: t("datos.filters.endpoint"),
      direction: t("datos.filters.direction"),
      correlationId: t("datos.filters.correlationId"),
      ok: t("datos.filters.ok"),
    };
    return map[key] ?? key;
  };

  // Label de una opción de select: orderType tiene su mapa propio; el
  // resto intenta datos.optionLabels (true/false, direction…) y cae al
  // catálogo de estados compartido (statusLabel).
  const valueLabel = (key: string) => (v: string) =>
    key === "orderType"
      ? orderLabel(v)
      : t.has(`datos.optionLabels.${v}`)
        ? t(`datos.optionLabels.${v}`)
        : statusLabel(v);

  const optionsFor = (key: string): Option[] => {
    const staticList = STATIC_OPTIONS[`${entity}.${key}`];
    if (staticList) {
      const labelOf = valueLabel(key);
      return staticList.map((v) => ({ value: v, label: labelOf(v) }));
    }
    const source = FILTER_SOURCES[entity][key];
    return source ? (fkOptions[source] ?? []) : [];
  };

  // Keys con opciones (whitelist estática o fuente FK) → select; el
  // resto (ids, tipo, actor, endpoint…) → input de texto libre.
  const isOptionKey = (key: string) =>
    !!STATIC_OPTIONS[`${entity}.${key}`] || !!FILTER_SOURCES[entity][key];

  const selectKeys = ENTITY_PARAMS[entity].filter(
    (k) => k !== "q" && k !== "from" && k !== "to",
  );

  // ── Render de filas por entidad ───────────────────────────────────────

  const meta = (text: string) => (
    <span className="text-xs text-white/50">{text}</span>
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
                <span className="shrink-0 text-xs text-white/40">
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
      default:
        return <li key={i} />;
    }
  }

  // Sin q ni rol, people devuelve [] por diseño — mostrar el hint en vez
  // de un vacío ambiguo.
  const peopleNeedsQuery =
    entity === "people" && !filters.role && debouncedQ.length < 2;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-white/60">{t("datos.subtitle")}</p>

      <PillTabs
        ariaLabel={t("datos.title")}
        active={entity}
        onSelect={selectEntity}
        items={ENTITIES.map((e) => ({
          key: e,
          label: t(`datos.entity.${e}`),
        }))}
      />

      {/* Filtros — auto-aplican; q va con debounce. */}
      <section className="flex flex-col gap-3" aria-label={t("datos.title")}>
        {HAS_Q.has(entity) && (
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("datos.filters.search")}
            aria-label={t("datos.filters.search")}
            className={inputCls}
          />
        )}
        {(selectKeys.length > 0 || HAS_DATES.has(entity)) && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {selectKeys.map((key) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-xs text-white/50">
                  {filterLabel(key)}
                </span>
                {isOptionKey(key) ? (
                  <select
                    value={filters[key] ?? ""}
                    onChange={(e) => setFilter(key, e.target.value)}
                    className={inputCls}
                  >
                    <option value="">{t("datos.filters.all")}</option>
                    {optionsFor(key).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={filters[key] ?? ""}
                    onChange={(e) => setFilter(key, e.target.value)}
                    className={inputCls}
                  />
                )}
              </label>
            ))}
            {HAS_DATES.has(entity) && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-white/50">
                    {t("datos.filters.from")}
                  </span>
                  <input
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) => setFilter("from", e.target.value)}
                    className={inputCls}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-white/50">
                    {t("datos.filters.to")}
                  </span>
                  <input
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) => setFilter("to", e.target.value)}
                    className={inputCls}
                  />
                </label>
              </>
            )}
          </div>
        )}
      </section>

      {phase === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white/70"
          >
            <RefreshIcon /> {tc("retry")}
          </button>
        </div>
      )}

      {phase === "loading" && rows === null && <SkeletonList />}
      {phase === "loading" && rows !== null && (
        <p role="status" className="page-loading text-sm text-white/50">
          {tc("loading")}
        </p>
      )}

      {phase === "ready" && rows !== null && (
        <>
          {peopleNeedsQuery ? (
            <p className="text-sm text-white/50">{t("users.searchHint")}</p>
          ) : rows.length === 0 ? (
            <Card className="py-6 text-center">
              <p className="text-sm text-white/70">{t("datos.empty")}</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">{rows.map(renderRow)}</ul>
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
          <p className="truncate text-xs text-white/50">
            {metaParts.join(" · ")}
          </p>
        )}
        {tail && (
          <p className="text-xs font-medium tabular-nums text-white/70">
            {tail}
          </p>
        )}
        {action}
      </Card>
    </li>
  );
}

/**
 * Payload JSON expandible — el browse no tenía renderer para columnas
 * Json (payment-events.payload, gateway request/response): <details>
 * nativo con el JSON pretty-printed truncado por scroll.
 */
function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <details className="mt-1">
      <summary className="w-fit cursor-pointer text-xs font-medium text-white/50 transition-colors hover:text-white/80">
        {label}
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-night-950/70 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all text-white/60">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}
