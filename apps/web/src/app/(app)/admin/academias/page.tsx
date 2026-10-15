"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonList,
  type BadgeVariant,
} from "@/components/ui";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";

// Salud de alumnos por academia (spec academy-score-refine): distribución
// de segmentos, score medio, top-3, en-riesgo y drill-down por alumno
// (link a su ficha /admin/usuarios/[personId]).

type StudentRow = {
  personId: string;
  name: string | null;
  score: number;
  segment: string | null;
};

type AcademyHealth = {
  academyId: string;
  academyName: string | null;
  studentCount: number;
  avgScore: number;
  segments: Record<string, number>;
  top: StudentRow[];
  atRisk: StudentRow[];
  rows: StudentRow[];
};

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

  const [items, setItems] = useState<AcademyHealth[] | null>(null);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

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

  return (
    <>
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
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
        <ul className="flex flex-col gap-3">
          {items.map((a) => {
            const expanded = open === a.academyId;
            return (
              <li key={a.academyId}>
                <Card className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : a.academyId)}
                    aria-expanded={expanded}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {a.academyName ?? a.academyId}
                    </span>
                    <Badge variant="muted">
                      {t("academies.students", { count: a.studentCount })}
                    </Badge>
                    <Badge variant="outline">
                      {t("academies.avg", { score: a.avgScore })}
                    </Badge>
                  </button>

                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(a.segments).map(([seg, count]) =>
                      count > 0 ? (
                        <Badge
                          key={seg}
                          variant={SEGMENT_VARIANT[seg] ?? "muted"}
                        >
                          {tcrm(`segments.${seg}`)} · {count}
                        </Badge>
                      ) : null,
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        {t("academies.top")}
                      </p>
                      <ul className="mt-1 flex flex-col gap-1 text-sm">
                        {a.top.map((s) => (
                          <StudentLine key={s.personId} s={s} />
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">
                        {t("academies.atRisk")}
                      </p>
                      {a.atRisk.length === 0 ? (
                        <p className="mt-1 text-sm text-ink/50">
                          {t("academies.noneAtRisk")}
                        </p>
                      ) : (
                        <ul className="mt-1 flex flex-col gap-1 text-sm">
                          {a.atRisk.map((s) => (
                            <StudentLine key={s.personId} s={s} />
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <ul className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
                      {a.rows.map((s) => (
                        <StudentLine key={s.personId} s={s} />
                      ))}
                    </ul>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  function StudentLine({ s }: { s: StudentRow }) {
    return (
      <li>
        <Link
          href={`/admin/usuarios/${s.personId}`}
          className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-elevated"
        >
          <span className="min-w-0 flex-1 truncate">
            {s.name ?? s.personId}
          </span>
          {s.segment && (
            <Badge variant={SEGMENT_VARIANT[s.segment] ?? "muted"}>
              {tcrm(`segments.${s.segment}`)}
            </Badge>
          )}
          <span className="tabular-nums text-ink/70">
            {Math.round(s.score)}
          </span>
        </Link>
      </li>
    );
  }
}
