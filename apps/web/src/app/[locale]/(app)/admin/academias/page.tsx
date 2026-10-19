"use client";

import { useCallback, useEffect, useState } from "react";

import { useTranslations, useLocale } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronDownIcon,
  ClockIcon,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";
import { getDateFmt, useNumFmt } from "@/lib/intl";
import { Link } from "@/i18n/navigation";

const fmtDate = (iso: string, locale: string) =>
  getDateFmt(locale, { dateStyle: "medium" }).format(new Date(iso));

// Salud de alumnos por academia (spec academy-score-refine): distribución
// de segmentos con % del total, score medio y conteo inscritos/activos.

type AcademyHealth = {
  academyId: string;
  academyName: string | null;
  studentCount: number;
  avgScore: number;
  computedAt: string;
  billingMonthClp: number;
  billingPrevMonthClp: number;
  enrolledCount: number;
  enrolledPrev: number;
  planCount: number;
  planPrev: number;
  activeNow: number;
  activePrev: number;
  segments: Record<string, number>;
  segmentsPrev: Record<string, number> | null;
  tier: string | null;
  billingBlocked: boolean;
};

/** Delta vs mes anterior: "+N (+X%)" con color verde/rojo/mutado. */
function DeltaText({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return null;
  const d = now - prev;
  const pct = prev > 0 ? Math.round((d / prev) * 100) : null;
  return (
    <span
      className={`text-xs font-medium tabular-nums ${
        d > 0 ? "text-green-400" : d < 0 ? "text-red-400" : "text-ink/50"
      }`}
    >
      {d > 0 ? "+" : ""}
      {d}
      {pct !== null ? ` (${d > 0 ? "+" : ""}${pct}%)` : ""}
    </span>
  );
}

const SEGMENT_VARIANT: Record<string, BadgeVariant> = {
  NEW: "neon",
  AT_RISK: "live",
  BRINGS_PEOPLE: "outline",
  CORE: "muted",
};

export default function AdminAcademiasPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-5xl lg:px-8">
      <AdminGate>
        <HealthPanel />
      </AdminGate>
    </main>
  );
}

function HealthPanel() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const tcrm = useTranslations("crm");
  const locale = useLocale();
  const clp = useNumFmt({
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  });

  const [items, setItems] = useState<AcademyHealth[] | null>(null);
  const [error, setError] = useState(false);
  // Filtros locales: búsqueda por nombre, solo con alumnos en riesgo y
  // orden (los datos ya llegan completos - filtrar es client-side).
  const [q, setQ] = useState("");
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [sort, setSort] = useState("score");
  const [sortAsc, setSortAsc] = useState(false);


  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/admin/academies/score-health");
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems(((await res.json()) as { items: AcademyHealth[] }).items);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtro + orden client-side sobre los items ya cargados.
  const sorted = (items ?? [])
    .filter(
      (a) =>
        !q.trim() ||
        (a.academyName ?? a.academyId)
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
    )
    .filter((a) => !atRiskOnly || (a.segments.AT_RISK ?? 0) > 0)
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sort === "billing") return (a.billingMonthClp - b.billingMonthClp) * dir;
      if (sort === "students") return (a.studentCount - b.studentCount) * dir;
      if (sort === "name")
        return (a.academyName ?? "").localeCompare(b.academyName ?? "") * dir;
      return (a.avgScore - b.avgScore) * dir;
    });

  return (
    <>
      <ConsoleHeader backHref="/inicio" backLabel={t("modules.backHome")} />
      <p className="text-sm text-ink/60">{t("academies.desc")}</p>

      {error ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-ink/60">
            {t("academies.error")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      ) : items === null ? (
        <SkeletonList items={3} lines={1} />
      ) : items.length === 0 ? (
        <p role="status" className="text-sm text-ink/50">
          {t("academies.empty")}
        </p>
      ) : (
        <>
          {/* Filtro local: search a fila completa en mobile
              (basis-full fuerza el wrap), una sola fila desde sm */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("academies.search")}
              aria-label={t("academies.search")}
              className={`${inputCls} basis-full sm:basis-40 sm:grow`}
            />
            {/* Chip toggle: solo academias con alumnos en riesgo */}
            <button
              type="button"
              aria-pressed={atRiskOnly}
              onClick={() => setAtRiskOnly((v) => !v)}
              className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                atRiskOnly
                  ? "bg-neon text-on-accent"
                  : "bg-ink/10 text-ink/70 hover:text-ink"
              }`}
            >
              {t("academies.atRiskOnly")}
            </button>
            {/* Select + dirección en fila propia en mobile (basis-full);
                se unen a la fila de chips desde sm */}
            <div className="flex basis-full items-center gap-2 sm:basis-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                aria-label={t("academies.sortLabel")}
                className={`${inputCls} flex-1 sm:w-auto`}
              >
                <option value="score">{t("academies.sort.score")}</option>
                <option value="billing">{t("academies.sort.billing")}</option>
                <option value="students">{t("academies.sort.students")}</option>
                <option value="name">{t("academies.sort.name")}</option>
              </select>
              {/* Dirección del orden: ↓ desc (default) / ↑ asc */}
              <button
                type="button"
                aria-pressed={sortAsc}
                onClick={() => setSortAsc((v) => !v)}
                title={t(`academies.sortDir.${sortAsc ? "asc" : "desc"}`)}
                aria-label={t(`academies.sortDir.${sortAsc ? "asc" : "desc"}`)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line bg-elevated text-ink/70 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <ChevronDownIcon
                  className={`h-4 w-4 transition-transform ${sortAsc ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>

          {sorted.length === 0 ? (
            <p role="status" className="text-sm text-ink/50">
              {t("academies.noResults")}
            </p>
          ) : null}
          {/* Dos cards por fila en ≥sm; en mobile apiladas con el nombre
              completo (envuelve, no trunca). */}
          <ul className="grid gap-3 sm:grid-cols-2">
          {sorted.map((a) => {
            // Delta % vs mes anterior (null si no hay base de comparación).
            const deltaPct =
              a.billingPrevMonthClp > 0
                ? Math.round(
                    ((a.billingMonthClp - a.billingPrevMonthClp) /
                      a.billingPrevMonthClp) *
                      100,
                  )
                : null;
            const deltaClp = a.billingMonthClp - a.billingPrevMonthClp;
            return (
              <li key={a.academyId} className="h-full">
                {/* Card completo → ficha admin de la academia
                    (arquetipo rail card: el card es el link). */}
                <Link
                  href={`/admin/academias/${a.academyId}`}
                  className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                <Card className="flex h-full flex-col gap-3 transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
                  {/* Headline: nombre + inscritos/activos + promedio
                      dominante (dato que decide si la academia está sana) */}
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-base font-semibold leading-snug">
                      {a.academyName ?? a.academyId}
                    </span>
                    <span className="shrink-0 text-2xl font-bold leading-none tabular-nums">
                      {Math.round(a.avgScore)}
                      <span className="ml-0.5 text-xs font-normal text-ink/40">
                        prom.
                      </span>
                    </span>
                  </div>

                  {/* Conteos con delta vs mes anterior: inscritos,
                      activos (plan vigente) y activos con check-in
                      (asistencia del mes) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="muted">
                      {t("academies.enrolled", { count: a.enrolledCount })}
                    </Badge>
                    <DeltaText now={a.enrolledCount} prev={a.enrolledPrev} />
                    <Badge variant="neon">
                      {t("academies.active", { count: a.planCount })}
                    </Badge>
                    <DeltaText now={a.planCount} prev={a.planPrev} />
                    <Badge variant="outline">
                      {t("academies.checkin", { count: a.activeNow })}
                    </Badge>
                    <DeltaText now={a.activeNow} prev={a.activePrev} />
                  </div>

                  {/* Tag-row: distribución de segmentos; el delta semanal
                      va fuera del chip (mismo patrón que los conteos) */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(a.segments).map(([seg, count]) =>
                      count > 0 ? (
                        <span key={seg} className="flex items-center gap-1.5">
                          <Badge variant={SEGMENT_VARIANT[seg] ?? "muted"}>
                            {tcrm(`segments.${seg}`)} · {count}
                          </Badge>
                          {a.segmentsPrev && (
                            <DeltaText
                              now={count}
                              prev={a.segmentsPrev[seg] ?? 0}
                            />
                          )}
                        </span>
                      ) : null,
                    )}
                  </div>

                  {/* Facturación del mes + comparación vs el anterior
                      (pagos PAID que resuelven a la academia) */}
                  <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
                    <span className="text-base font-bold tabular-nums">
                      {clp.format(a.billingMonthClp)}
                    </span>
                    {/* Delta con color semántico: +verde / −rojo /
                        neutro mutado (§5 del skill) */}
                    <span
                      className={`shrink-0 text-xs font-medium tabular-nums ${
                        deltaPct !== null
                          ? deltaPct > 0
                            ? "text-green-400"
                            : deltaPct < 0
                              ? "text-red-400"
                              : "text-ink/50"
                          : a.billingMonthClp > 0
                            ? "text-green-400"
                            : "text-ink/50"
                      }`}
                    >
                      {deltaPct !== null
                        ? `${deltaClp > 0 ? "+" : ""}${clp.format(deltaClp)} (${deltaPct > 0 ? "+" : ""}${deltaPct}%)`
                        : a.billingMonthClp > 0
                          ? t("academies.billingNew")
                          : "—"}
                    </span>
                  </div>

                  {/* Footnote: chip de suscripción izq + fecha de
                      recomputación der (terciario, trazabilidad) */}
                  <div className="flex items-center justify-between gap-2">
                    {a.billingBlocked ? (
                      <Badge variant="live">
                        {t("academies.detail.blocked")}
                      </Badge>
                    ) : a.tier ? (
                      <Badge variant="outline">{a.tier}</Badge>
                    ) : (
                      <Badge variant="muted">
                        {t("academies.detail.noSubscription")}
                      </Badge>
                    )}
                    <p className="flex items-center gap-1 text-[11px] text-ink/40">
                      <ClockIcon className="h-3 w-3" />
                      <span className="sr-only">
                        {t("academies.updated", { date: "" }).trim()}
                      </span>
                      {fmtDate(a.computedAt, locale)}
                    </p>
                  </div>
                </Card>
                </Link>
              </li>
            );
          })}
          </ul>
        </>
      )}
    </>
  );
}
