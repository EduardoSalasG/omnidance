"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Card, PillTabs, type BadgeVariant } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
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
  | "leads";

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
  createdAt: string;
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
};

const STATIC_OPTIONS: Record<string, string[]> = {
  "events.status": EVENT_STATUSES,
  "payments.status": PAYMENT_STATUSES,
  "payments.orderType": ORDER_TYPES,
  "tickets.status": TICKET_STATUSES,
  "rentals.status": RENTAL_STATUSES,
  "leads.status": LEAD_STATUSES,
  "leads.intent": LEAD_INTENTS,
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
};

const HAS_Q = new Set<Entity>(["events", "academies", "venues", "people", "leads"]);
const HAS_DATES = new Set<Entity>(["events", "classes", "payments", "leads"]);

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
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6 pb-24">
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
    };
    return map[key] ?? key;
  };

  const optionsFor = (key: string): Option[] => {
    const staticList = STATIC_OPTIONS[`${entity}.${key}`];
    if (staticList) {
      const labelOf = key === "orderType" ? orderLabel : statusLabel;
      return staticList.map((v) => ({ value: v, label: labelOf(v) }));
    }
    const source = FILTER_SOURCES[entity][key];
    return source ? (fkOptions[source] ?? []) : [];
  };

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
              {r.email && meta(r.email)}
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
            className="min-h-[44px] rounded-full bg-white/10 px-4 text-sm font-semibold text-white/70"
          >
            ↻ {tc("retry")}
          </button>
        </div>
      )}

      {phase === "loading" && rows === null && <PageLoading />}
      {phase === "loading" && rows !== null && (
        <p role="status" className="text-sm text-white/50">
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
}: {
  title: string;
  badge?: string;
  badgeLabel?: string;
  meta: (string | null | undefined)[];
  tail?: string;
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
      </Card>
    </li>
  );
}
