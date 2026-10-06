"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError } from "@/components/academy/shared";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";

// Consola de jobs (spec admin-jobs-mail-campaigns): lista los
// ScheduledJob con su horario DB-editable, último resultado, próxima
// corrida e historial. Edición de cron con validación del server,
// pausa/reactivación, corrida manual y runs expandibles.

type Job = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  cronExpr: string;
  defaultCron: string;
  timezone: string;
  enabled: boolean;
  orphaned: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  nextRunAt: string | null;
  runCount: number;
};

type JobRun = {
  id: string;
  trigger: "CRON" | "MANUAL";
  status: "RUNNING" | "OK" | "ERROR";
  error: string | null;
  meta: Record<string, unknown> | null;
  actorId: string | null;
  startedAt: string;
  finishedAt: string | null;
};

const dt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});
const fmt = (iso: string | null) => (iso ? dt.format(new Date(iso)) : "—");

const CRON_PRESETS = [
  { label: "Cada minuto", expr: "* * * * *" },
  { label: "Cada hora", expr: "0 * * * *" },
  { label: "Diario 09:00", expr: "0 9 * * *" },
  { label: "Diario 12:00", expr: "0 12 * * *" },
  { label: "Lunes 09:00", expr: "0 9 * * 1" },
];

export default function AdminJobsPage() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <JobsPanel />
      </AdminGate>
    </main>
  );
}

function statusBadge(job: Job, t: (k: string) => string) {
  if (job.orphaned) return <Badge variant="outline">{t("jobs.status.orphaned")}</Badge>;
  if (!job.enabled) return <Badge variant="muted">{t("jobs.status.paused")}</Badge>;
  if (job.lastStatus === "ERROR") return <Badge variant="live">{t("jobs.status.error")}</Badge>;
  if (job.lastStatus === "RUNNING") return <Badge variant="neon">{t("jobs.status.running")}</Badge>;
  return <Badge variant="neon">{t("jobs.status.active")}</Badge>;
}

function JobsPanel() {
  const t = useTranslations("admin");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [cronDraft, setCronDraft] = useState("");
  const [runsFor, setRunsFor] = useState<string | null>(null);
  const [runs, setRuns] = useState<JobRun[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await apiFetch("/admin/jobs");
    if (!res.ok) {
      setError(await readError(res));
      setJobs([]);
      return;
    }
    setJobs(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const res = await apiFetch(`/admin/jobs/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) setError(await readError(res));
      else await load();
    } finally {
      setBusy(null);
    }
  }

  async function runNow(key: string) {
    if (!window.confirm(t("jobs.runConfirm"))) return;
    setBusy(key);
    setError(null);
    try {
      const res = await apiFetch(`/admin/jobs/${encodeURIComponent(key)}/run`, {
        method: "POST",
      });
      if (!res.ok) setError(await readError(res));
      else await load();
    } finally {
      setBusy(null);
    }
  }

  async function toggleRuns(key: string) {
    if (runsFor === key) {
      setRunsFor(null);
      setRuns(null);
      return;
    }
    setRunsFor(key);
    setRuns(null);
    const res = await apiFetch(`/admin/jobs/${encodeURIComponent(key)}/runs`);
    setRuns(res.ok ? await res.json() : []);
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("jobs.title")}</h1>
        <p className="text-sm text-white/60">{t("jobs.desc")}</p>
        {error && (
          <Card className="border-red-500/40 p-3 text-sm text-red-300">
            {error}
          </Card>
        )}
      </section>

      {jobs === null ? (
        <SkeletonList items={4} />
      ) : jobs.length === 0 ? (
        <Card className="p-4 text-sm text-white/60">{t("jobs.empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {jobs.map((job) => (
            <Card key={job.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{job.label}</p>
                  <p className="font-mono text-xs text-white/40">{job.key}</p>
                  {job.description && (
                    <p className="mt-1 text-xs text-white/50">{job.description}</p>
                  )}
                </div>
                {statusBadge(job, t)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-white/40">{t("jobs.schedule")}</p>
                  <p className="font-mono text-white/80">{job.cronExpr}</p>
                  <p className="text-white/40">{job.timezone}</p>
                </div>
                <div>
                  <p className="text-white/40">{t("jobs.nextRun")}</p>
                  <p className="text-white/80">{fmt(job.nextRunAt)}</p>
                </div>
                <div>
                  <p className="text-white/40">{t("jobs.lastRun")}</p>
                  <p className="text-white/80">{fmt(job.lastRunAt)}</p>
                </div>
                <div>
                  <p className="text-white/40">{t("jobs.runs")}</p>
                  <p className="text-white/80">{job.runCount}</p>
                </div>
              </div>
              {job.lastStatus === "ERROR" && job.lastError && (
                <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300">
                  {job.lastError}
                </p>
              )}

              {editing === job.key ? (
                <form
                  className="flex flex-col gap-2 rounded-xl border border-white/10 p-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await patch(job.key, { cronExpr: cronDraft });
                    setEditing(null);
                  }}
                >
                  <label className="text-xs text-white/60">
                    {t("jobs.cronLabel")}
                  </label>
                  <input
                    className={inputCls}
                    value={cronDraft}
                    onChange={(e) => setCronDraft(e.target.value)}
                    placeholder="0 9 * * *"
                  />
                  <div className="flex flex-wrap gap-1">
                    {CRON_PRESETS.map((p) => (
                      <button
                        key={p.expr}
                        type="button"
                        className="rounded-full border border-white/15 px-2 py-1 text-xs text-white/60 hover:border-white/30"
                        onClick={() => setCronDraft(p.expr)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" disabled={busy === job.key}>
                      {busy === job.key ? <Spinner size="sm" /> : t("jobs.save")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(null)}
                    >
                      {t("jobs.cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={job.orphaned || busy === job.key}
                    onClick={() => patch(job.key, { enabled: !job.enabled })}
                  >
                    {job.enabled ? t("jobs.pause") : t("jobs.resume")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(job.key);
                      setCronDraft(job.cronExpr);
                    }}
                  >
                    {t("jobs.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={job.orphaned || busy === job.key}
                    onClick={() => runNow(job.key)}
                  >
                    {busy === job.key ? <Spinner size="sm" /> : t("jobs.runNow")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRuns(job.key)}
                  >
                    {runsFor === job.key ? t("jobs.hideRuns") : t("jobs.showRuns")}
                  </Button>
                </div>
              )}

              {runsFor === job.key && (
                <div className="rounded-xl border border-white/10">
                  {runs === null ? (
                    <div className="p-3">
                      <SkeletonList items={2} />
                    </div>
                  ) : runs.length === 0 ? (
                    <p className="p-3 text-xs text-white/50">{t("jobs.noRuns")}</p>
                  ) : (
                    <ul className="flex flex-col">
                      {runs.map((run) => (
                        <li
                          key={run.id}
                          className="flex flex-col gap-1 border-t border-white/10 p-3 text-xs first:border-t-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2">
                              <Badge
                                variant={
                                  run.status === "ERROR"
                                    ? "live"
                                    : run.status === "RUNNING"
                                      ? "muted"
                                      : "neon"
                                }
                              >
                                {t(`jobs.runStatus.${run.status}`)}
                              </Badge>
                              <span className="text-white/50">
                                {t(`jobs.trigger.${run.trigger}`)}
                              </span>
                            </span>
                            <span className="text-white/40">
                              {fmt(run.startedAt)}
                            </span>
                          </div>
                          {run.error && (
                            <p className="text-red-300">{run.error}</p>
                          )}
                          {run.meta && (
                            <p className="font-mono text-white/40">
                              {JSON.stringify(run.meta)}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
