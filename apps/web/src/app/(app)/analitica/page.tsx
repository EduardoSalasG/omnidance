"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { EVENT_STATUS_VARIANT } from "@/components/producer/shared";

/**
 * /analitica — métricas por lente de rol. GET /analytics/roles devuelve los
 * roles aprobados con analítica; el segmented control (radiogroup nativo,
 * mismo patrón de pills de /perfil) cambia de lente y refetchea el summary.
 * Sin h1 visible: el chrome ya muestra "Analítica" via pageLabel.
 */

type Role = "ADMIN" | "PRODUCER" | "ACADEMY_OWNER" | "VENUE_MANAGER";

type Kpi = { key: string; value: number; format?: "clp" | "pct" };

type AdminSections = {
  eventsByStatus?: Record<string, number>;
  payouts?: { gross: number; platformFee: number; net: number };
  topProducers?: { id: string; name: string; gross: number }[];
};
type ProducerEvent = {
  id: string;
  name: string;
  startsAt: string;
  status: string;
  sold: number;
  gross30d: number;
  checkins30d: number;
  capacity: number;
  occupancyPct: number | null;
};
type AcademyRow = {
  id: string;
  name: string;
  students: number;
  attendance30d: number;
  classes30d: number;
  seriesActive: number;
  occupancyPct: number | null;
};
type VenueRow = {
  id: string;
  name: string;
  upcoming: number;
  events30d: number;
  checkins30d: number;
};

type Summary = {
  role: string;
  periodDays: number;
  kpis: Kpi[];
  sections: Record<string, unknown>;
};

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");
const dayFmt = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

function formatKpi(k: Kpi): string {
  if (k.format === "clp") return clp.format(k.value);
  if (k.format === "pct") return `${num.format(k.value)}%`;
  return num.format(k.value);
}

// Mini-stat de las listas por ítem (evento/academia/venue).
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-base font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-white/50">{label}</span>
    </div>
  );
}

export default function AnaliticaPage() {
  const t = useTranslations("analytics");
  const tc = useTranslations("common");
  const tp = useTranslations("profile");
  const tpr = useTranslations("producer");

  const [phase, setPhase] = useState<
    "loading" | "error" | "forbidden" | "ready"
  >("loading");
  const [roles, setRoles] = useState<Role[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [summaryPhase, setSummaryPhase] = useState<
    "loading" | "error" | "forbidden" | "ready"
  >("loading");
  const [summary, setSummary] = useState<Summary | null>(null);

  const roleLabel = (r: string) =>
    tp.has(`roleLabels.${r}`) ? tp(`roleLabels.${r}`) : r;
  const statusLabel = (s: string) =>
    tpr.has(`status.${s}`) ? tpr(`status.${s}`) : s;

  // Boot: qué lentes tiene disponibles el usuario. 403/401 o array vacío
  // → forbidden (sin analítica); cualquier otro fallo → error + retry.
  const boot = useCallback(async () => {
    setPhase("loading");
    try {
      const res = await apiFetch("/analytics/roles");
      if (res.status === 401 || res.status === 403) {
        setPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setPhase("error");
        return;
      }
      const list = (await res.json()) as Role[];
      if (list.length === 0) {
        setPhase("forbidden");
        return;
      }
      setRoles(list);
      setRole((prev) => (prev && list.includes(prev) ? prev : list[0]));
      setPhase("ready");
    } catch {
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Summary del lente activo — refetch al cambiar de rol. 403 (rol que
  // perdió aprobación entre requests) muestra forbidden pero deja el
  // selector vivo para cambiar a un lente válido.
  const loadSummary = useCallback(async (r: Role) => {
    setSummaryPhase("loading");
    setSummary(null);
    try {
      const res = await apiFetch(`/analytics/summary?role=${r}`);
      if (res.status === 403 || res.status === 401) {
        setSummaryPhase("forbidden");
        return;
      }
      if (!res.ok) {
        setSummaryPhase("error");
        return;
      }
      setSummary((await res.json()) as Summary);
      setSummaryPhase("ready");
    } catch {
      setSummaryPhase("error");
    }
  }, []);

  useEffect(() => {
    if (role) void loadSummary(role);
  }, [role, loadSummary]);

  if (phase === "loading") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <p className="pt-6 text-sm text-white/50">{tc("loading")}</p>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{t("error")}</p>
          <Button variant="secondary" size="sm" onClick={() => void boot()}>
            {tc("retry")}
          </Button>
        </Card>
      </main>
    );
  }

  if (phase === "forbidden") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("forbidden")}</p>
        </Card>
      </main>
    );
  }

  const sections = (summary?.sections ?? {}) as AdminSections & {
    events?: ProducerEvent[];
    academies?: AcademyRow[];
    venues?: VenueRow[];
  };

  // Empty: las colecciones del lente vinieron vacías (KPIs pueden seguir
  // mostrándose — el estado vacío apunta a las secciones).
  const sectionsEmpty = (() => {
    if (!summary) return false;
    switch (role) {
      case "ADMIN":
        return (
          Object.keys(sections.eventsByStatus ?? {}).length === 0 &&
          !sections.payouts &&
          (sections.topProducers ?? []).length === 0
        );
      case "PRODUCER":
        return (sections.events ?? []).length === 0;
      case "ACADEMY_OWNER":
        return (sections.academies ?? []).length === 0;
      case "VENUE_MANAGER":
        return (sections.venues ?? []).length === 0;
      default:
        return false;
    }
  })();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-3 pt-4">
        <p className="text-sm text-white/50">{t("period")}</p>

        {/* Selector de lente — radiogroup nativo de pills (mismo patrón
            que "Interactuar como" de /perfil): un tab stop, flechas
            cambian de opción. Solo si hay más de un rol con analítica. */}
        {roles.length > 1 && (
          <div
            role="radiogroup"
            aria-label={t("lens")}
            className="flex flex-wrap gap-2"
          >
            {roles.map((r) => (
              <label key={r} className="cursor-pointer">
                <input
                  type="radio"
                  name="analytics-lens"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 select-none items-center rounded-full border border-night-700 bg-night-800 px-4 text-sm font-semibold text-white/70 transition-colors peer-checked:border-neon peer-checked:bg-neon peer-checked:text-night-950 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-white active:scale-[0.98] motion-reduce:active:scale-100">
                  {roleLabel(r)}
                </span>
              </label>
            ))}
          </div>
        )}
      </header>

      {summaryPhase === "loading" && (
        <p className="text-sm text-white/50">{tc("loading")}</p>
      )}

      {summaryPhase === "error" && (
        <Card className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-white/70">{t("error")}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => role && void loadSummary(role)}
          >
            {tc("retry")}
          </Button>
        </Card>
      )}

      {summaryPhase === "forbidden" && (
        <Card className="py-6 text-center">
          <p className="text-sm text-white/70">{t("forbidden")}</p>
        </Card>
      )}

      {summaryPhase === "ready" && summary && (
        <>
          {/* KPIs — mismo patrón de tiles del HomeHub; números en neon
              como datos destacados. */}
          {summary.kpis.length > 0 && (
            <section aria-label={t("title")}>
              <ul className="grid grid-cols-2 gap-3">
                {summary.kpis.map((k) => (
                  <li
                    key={k.key}
                    className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
                  >
                    <span className="block text-2xl font-bold tabular-nums text-neon">
                      {formatKpi(k)}
                    </span>
                    <span className="text-xs text-white/50">
                      {t.has(`kpi.${k.key}`) ? t(`kpi.${k.key}`) : k.key}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {sectionsEmpty && (
            <Card className="py-6 text-center">
              <p className="text-sm text-white/70">{t("empty")}</p>
            </Card>
          )}

          {/* ── ADMIN ─────────────────────────────────────────────── */}
          {role === "ADMIN" &&
            sections.eventsByStatus &&
            Object.keys(sections.eventsByStatus).length > 0 && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.eventsByStatus")}
                </h2>
                <ul className="mt-3 flex flex-col divide-y divide-night-700">
                  {Object.entries(sections.eventsByStatus).map(
                    ([status, count]) => (
                      <li
                        key={status}
                        className="flex items-center justify-between gap-3 py-2.5"
                      >
                        <Badge
                          variant={EVENT_STATUS_VARIANT[status] ?? "muted"}
                        >
                          {statusLabel(status)}
                        </Badge>
                        <span className="text-base font-semibold tabular-nums">
                          {num.format(count)}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </Card>
            )}

          {role === "ADMIN" && sections.payouts && (
            <section aria-label={t("sections.payouts")}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("sections.payouts")}
              </h2>
              <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-3">
                {(
                  [
                    [
                      t("cols.gross"),
                      sections.payouts.gross,
                    ],
                    [
                      t("kpi.platformFeeAccrued"),
                      sections.payouts.platformFee,
                    ],
                    [tpr("payoutsPage.net"), sections.payouts.net],
                  ] as const
                ).map(([label, value]) => (
                  <li
                    key={label}
                    className="rounded-xl border border-night-700 bg-night-800/60 px-4 py-3"
                  >
                    <span className="block text-lg font-bold tabular-nums text-neon">
                      {clp.format(value)}
                    </span>
                    <span className="text-xs text-white/50">{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {role === "ADMIN" &&
            (sections.topProducers ?? []).length > 0 && (
              <Card>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.topProducers")}
                </h2>
                <ol className="mt-3 flex flex-col divide-y divide-night-700">
                  {sections.topProducers!.map((p, i) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-3 py-2.5"
                    >
                      <span
                        aria-hidden
                        className="w-5 text-sm font-semibold tabular-nums text-white/40"
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-neon">
                        {clp.format(p.gross)}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

          {/* ── PRODUCER ──────────────────────────────────────────── */}
          {role === "PRODUCER" &&
            (sections.events ?? []).length > 0 && (
              <section aria-label={t("sections.events")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.events")}
                </h2>
                <ul className="flex flex-col gap-3">
                  {sections.events!.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-2xl border border-night-700 bg-night-900 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {e.name}
                          </p>
                          <p className="mt-0.5 text-xs text-white/50">
                            {dayFmt.format(new Date(e.startsAt))}
                          </p>
                        </div>
                        <Badge
                          variant={EVENT_STATUS_VARIANT[e.status] ?? "muted"}
                        >
                          {statusLabel(e.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 min-[420px]:grid-cols-4">
                        <Stat label={t("cols.sold")} value={num.format(e.sold)} />
                        <Stat
                          label={t("cols.gross")}
                          value={clp.format(e.gross30d)}
                        />
                        <Stat
                          label={t("cols.checkins")}
                          value={num.format(e.checkins30d)}
                        />
                        <Stat
                          label={t("cols.occupancy")}
                          value={
                            e.occupancyPct == null
                              ? "—"
                              : `${num.format(e.occupancyPct)}%`
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {/* ── ACADEMY_OWNER ─────────────────────────────────────── */}
          {role === "ACADEMY_OWNER" &&
            (sections.academies ?? []).length > 0 && (
              <section aria-label={t("sections.academies")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.academies")}
                </h2>
                <ul className="flex flex-col gap-3">
                  {sections.academies!.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-2xl border border-night-700 bg-night-900 p-4"
                    >
                      <p className="truncate text-sm font-semibold">
                        {a.name}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3 min-[420px]:grid-cols-5">
                        <Stat
                          label={t("cols.students")}
                          value={num.format(a.students)}
                        />
                        <Stat
                          label={t("cols.attendance")}
                          value={num.format(a.attendance30d)}
                        />
                        <Stat
                          label={t("cols.classes")}
                          value={num.format(a.classes30d)}
                        />
                        <Stat
                          label={t("cols.series")}
                          value={num.format(a.seriesActive)}
                        />
                        <Stat
                          label={t("cols.occupancy")}
                          value={
                            a.occupancyPct == null
                              ? "—"
                              : `${num.format(a.occupancyPct)}%`
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

          {/* ── VENUE_MANAGER ─────────────────────────────────────── */}
          {role === "VENUE_MANAGER" &&
            (sections.venues ?? []).length > 0 && (
              <section aria-label={t("sections.venues")}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">
                  {t("sections.venues")}
                </h2>
                <ul className="flex flex-col gap-3">
                  {sections.venues!.map((v) => (
                    <li
                      key={v.id}
                      className="rounded-2xl border border-night-700 bg-night-900 p-4"
                    >
                      <p className="truncate text-sm font-semibold">
                        {v.name}
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-3">
                        <Stat
                          label={t("cols.upcoming")}
                          value={num.format(v.upcoming)}
                        />
                        <Stat
                          label={t("cols.events")}
                          value={num.format(v.events30d)}
                        />
                        <Stat
                          label={t("cols.checkins")}
                          value={num.format(v.checkins30d)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
        </>
      )}
    </main>
  );
}
