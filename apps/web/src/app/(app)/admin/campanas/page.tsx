"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError } from "@/components/academy/shared";
import { Badge, Button, Card, SkeletonList } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { AdminGate } from "@/components/admin/admin-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";

// Campañas de mail (spec admin-jobs-mail-campaigns + context-audiences):
// el admin compone subject + HTML libre (preview en iframe sandbox) con
// variables {{var}} por destinatario, elige audiencia (todos / rol /
// evento / ciclo de vida con ventana en días, con conteo en vivo) y
// programa envío único o recurrente. Las audiencias de ciclo llevan
// dedup por ciclo - un cron diario no re-envía el mismo recordatorio.

const AUDIENCE_KINDS = [
  "ALL",
  "ROLE",
  "EVENT",
  "ENROLLMENTS_EXPIRING",
  "ENROLLMENTS_EXPIRED",
  "PLATFORM_SUB_EXPIRING",
  "CLAIMS_PENDING",
] as const;
type AudienceKind = (typeof AUDIENCE_KINDS)[number];

const LIFECYCLE = new Set<AudienceKind>([
  "ENROLLMENTS_EXPIRING",
  "ENROLLMENTS_EXPIRED",
  "PLATFORM_SUB_EXPIRING",
  "CLAIMS_PENDING",
]);

const VARS_BY_KIND: Record<AudienceKind, string[]> = {
  ALL: ["name", "email"],
  ROLE: ["name", "email"],
  EVENT: ["name", "email"],
  ENROLLMENTS_EXPIRING: ["name", "email", "academy", "plan", "endsAt"],
  ENROLLMENTS_EXPIRED: ["name", "email", "academy", "plan", "endsAt"],
  PLATFORM_SUB_EXPIRING: ["name", "email", "plan", "nextInvoiceAt"],
  CLAIMS_PENDING: ["name", "email", "academy", "count"],
};

type Campaign = {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  audience: { kind: AudienceKind; roleKey?: string; eventId?: string; days?: number };
  scheduleKind: "ONCE" | "CRON";
  runAt: string | null;
  cronExpr: string | null;
  timezone: string;
  status: "DRAFT" | "SCHEDULED" | "SENDING" | "DONE" | "FAILED" | "CANCELLED";
  nextRunAt: string | null;
  lastRunAt: string | null;
  sentCount: number;
  failCount: number;
};

type Role = { key: string; label: string };
type EventOpt = { id: string; name: string; startsAt: string; status: string };

const dt = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "short",
  timeStyle: "short",
});
const fmt = (iso: string | null) => (iso ? dt.format(new Date(iso)) : "—");

const CRON_PRESETS = [
  { label: "Diario 09:00", expr: "0 9 * * *" },
  { label: "Lunes 10:00", expr: "0 10 * * 1" },
  { label: "Semanal (viernes 18:00)", expr: "0 18 * * 5" },
];

export default function AdminCampanasPage() {
  const t = useTranslations("admin");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6">
      <ConsoleHeader backHref="/admin" backLabel={t("title")} />
      <AdminGate>
        <CampaignsPanel />
      </AdminGate>
    </main>
  );
}

function statusBadge(s: Campaign["status"], t: (k: string) => string) {
  const map: Record<Campaign["status"], "muted" | "neon" | "live" | "outline"> = {
    DRAFT: "muted",
    SCHEDULED: "neon",
    SENDING: "neon",
    DONE: "outline",
    FAILED: "live",
    CANCELLED: "muted",
  };
  return <Badge variant={map[s]}>{t(`campaigns.status.${s}`)}</Badge>;
}

function audienceLabel(a: Campaign["audience"], t: (k: string, v?: Record<string, string>) => string) {
  if (a.kind === "ALL") return t("campaigns.audienceAll");
  if (a.kind === "ROLE") return t("campaigns.audienceRole", { role: a.roleKey ?? "" });
  if (a.kind === "EVENT") return t("campaigns.audienceEvent", { event: a.eventId?.slice(0, 8) ?? "" });
  return t("campaigns.audienceLifecycle", {
    label: t(`campaigns.kind.${a.kind}`),
    days: String(a.days ?? 7),
  });
}

function scheduleLabel(c: Campaign, t: (k: string, v?: Record<string, string>) => string) {
  if (c.scheduleKind === "ONCE") return t("campaigns.scheduleOnce", { at: fmt(c.runAt) });
  return `${c.cronExpr} (${c.timezone})`;
}

function CampaignsPanel() {
  const t = useTranslations("admin");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await apiFetch("/admin/mail-campaigns");
    if (!res.ok) {
      setError(await readError(res));
      setCampaigns([]);
      return;
    }
    setCampaigns(await res.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: "test" | "run" | "cancel") {
    setBusy(`${id}:${action}`);
    setError(null);
    try {
      const res = await apiFetch(`/admin/mail-campaigns/${id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) setError(await readError(res));
      else await load();
    } finally {
      setBusy(null);
    }
  }

  const editable = (c: Campaign) => c.status === "DRAFT" || c.status === "SCHEDULED";
  const cancellable = (c: Campaign) =>
    c.status === "DRAFT" || c.status === "SCHEDULED" || c.status === "SENDING";

  return (
    <>
      <section className="flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t("campaigns.title")}</h1>
        <p className="text-sm text-ink/60">{t("campaigns.desc")}</p>
        {error && (
          <Card className="border-red-500/40 p-3 text-sm text-red-300">
            {error}
          </Card>
        )}
        {!showForm && (
          <div>
            <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
              {t("campaigns.new")}
            </Button>
          </div>
        )}
      </section>

      {showForm && (
        <CampaignForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowForm(false);
            setEditing(null);
            await load();
          }}
          onError={setError}
        />
      )}

      {campaigns === null ? (
        <SkeletonList items={3} />
      ) : campaigns.length === 0 ? (
        <Card className="p-4 text-sm text-ink/60">{t("campaigns.empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {campaigns.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{c.name}</p>
                  <p className="text-xs text-ink/50">{c.subject}</p>
                </div>
                {statusBadge(c.status, t)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                <div>
                  <p className="text-ink/40">{t("campaigns.audience")}</p>
                  <p className="text-ink/80">{audienceLabel(c.audience, t)}</p>
                </div>
                <div>
                  <p className="text-ink/40">{t("campaigns.schedule")}</p>
                  <p className="text-ink/80">{scheduleLabel(c, t)}</p>
                </div>
                <div>
                  <p className="text-ink/40">{t("campaigns.counters")}</p>
                  <p className="text-ink/80">
                    {c.sentCount} ✓ / {c.failCount} ✗
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {editable(c) && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setEditing(c);
                      setShowForm(true);
                    }}
                  >
                    {t("campaigns.edit")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === `${c.id}:test`}
                  onClick={() => act(c.id, "test")}
                >
                  {busy === `${c.id}:test` ? <Spinner size="sm" /> : t("campaigns.test")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    busy === `${c.id}:run` ||
                    c.status === "SENDING" ||
                    c.status === "CANCELLED"
                  }
                  onClick={() => {
                    if (window.confirm(t("campaigns.runConfirm"))) void act(c.id, "run");
                  }}
                >
                  {busy === `${c.id}:run` ? <Spinner size="sm" /> : t("campaigns.runNow")}
                </Button>
                {cancellable(c) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === `${c.id}:cancel`}
                    onClick={() => {
                      if (window.confirm(t("campaigns.cancelConfirm"))) void act(c.id, "cancel");
                    }}
                  >
                    {t("campaigns.cancel")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}

function CampaignForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: Campaign | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (e: string | null) => void;
}) {
  const t = useTranslations("admin");
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [htmlBody, setHtmlBody] = useState(initial?.htmlBody ?? "");
  const [kind, setKind] = useState<AudienceKind>(initial?.audience.kind ?? "ALL");
  const [roleKey, setRoleKey] = useState(initial?.audience.roleKey ?? "DANCER");
  const [eventId, setEventId] = useState(initial?.audience.eventId ?? "");
  const [days, setDays] = useState(String(initial?.audience.days ?? 7));
  const [scheduleKind, setScheduleKind] = useState<"ONCE" | "CRON">(initial?.scheduleKind ?? "ONCE");
  const [runAt, setRunAt] = useState(
    initial?.runAt ? initial.runAt.slice(0, 16) : "",
  );
  const [cronExpr, setCronExpr] = useState(initial?.cronExpr ?? "0 9 * * *");
  const [schedule, setSchedule] = useState(initial?.status === "SCHEDULED");
  const [roles, setRoles] = useState<Role[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [eventQ, setEventQ] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void apiFetch("/admin/roles").then(async (r) => {
      if (r.ok) setRoles(await r.json());
    });
  }, []);

  // Buscador de eventos (debounce): sin filtro de status — también los
  // pasados sirven como audiencia (mail post-evento a asistentes).
  useEffect(() => {
    if (kind !== "EVENT") return;
    if (eventTimer.current) clearTimeout(eventTimer.current);
    eventTimer.current = setTimeout(async () => {
      const params = eventQ.trim()
        ? `?q=${encodeURIComponent(eventQ.trim())}`
        : "";
      const r = await apiFetch(`/admin/browse/events${params}`);
      if (r.ok) setEvents(await r.json());
    }, 300);
    return () => {
      if (eventTimer.current) clearTimeout(eventTimer.current);
    };
  }, [kind, eventQ]);

  // Conteo de audiencia en vivo (debounce 400ms).
  useEffect(() => {
    if (countTimer.current) clearTimeout(countTimer.current);
    countTimer.current = setTimeout(async () => {
      const params = new URLSearchParams({ kind });
      if (kind === "ROLE") params.set("roleKey", roleKey);
      if (kind === "EVENT") params.set("eventId", eventId);
      if (LIFECYCLE.has(kind)) params.set("days", days);
      const res = await apiFetch(`/admin/mail-campaigns/audience-count?${params}`);
      if (res.ok) setCount((await res.json()).count);
      else setCount(null);
    }, 400);
    return () => {
      if (countTimer.current) clearTimeout(countTimer.current);
    };
  }, [kind, roleKey, eventId, days]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const audience =
      kind === "ROLE"
        ? { kind, roleKey }
        : kind === "EVENT"
          ? { kind, eventId }
          : LIFECYCLE.has(kind)
            ? { kind, days: Number(days) || 7 }
            : { kind };
    const body = {
      name,
      subject,
      htmlBody,
      audience,
      scheduleKind,
      runAt: scheduleKind === "ONCE" && runAt ? new Date(runAt).toISOString() : undefined,
      cronExpr: scheduleKind === "CRON" ? cronExpr : undefined,
      status: schedule ? "SCHEDULED" : "DRAFT",
    };
    try {
      const res = await apiFetch(
        initial ? `/admin/mail-campaigns/${initial.id}` : "/admin/mail-campaigns",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        onError(await readError(res));
      } else {
        await onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 border-neon/30 p-4">
      <h2 className="text-sm font-semibold">
        {initial ? t("campaigns.editTitle") : t("campaigns.newTitle")}
      </h2>
      <form className="flex flex-col gap-3" onSubmit={save}>
        <input
          className={inputCls}
          placeholder={t("campaigns.namePh")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className={inputCls}
          placeholder={t("campaigns.subjectPh")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <textarea
          className={`${inputCls} min-h-32 font-mono text-xs`}
          placeholder={t("campaigns.htmlPh")}
          value={htmlBody}
          onChange={(e) => setHtmlBody(e.target.value)}
          required
        />
        {htmlBody && (
          <details className="rounded-xl border border-ink/10">
            <summary className="cursor-pointer p-2 text-xs text-ink/60">
              {t("campaigns.preview")}
            </summary>
            <iframe
              sandbox=""
              title={t("campaigns.preview")}
              srcDoc={htmlBody}
              // bg-white literal: es un documento de email preview -
              // superficie de documento, no de UI, siempre blanca.
              className="h-64 w-full rounded-b-xl bg-white"
            />
          </details>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink/60">
            {t("campaigns.audience")}
          </p>
          <div className="flex flex-wrap gap-2">
            {AUDIENCE_KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs">
                <input
                  type="radio"
                  name="aud"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />
                {t(`campaigns.kind.${k}`)}
              </label>
            ))}
          </div>
          {LIFECYCLE.has(kind) && (
            <label className="flex items-center gap-2 text-xs text-ink/70">
              {t("campaigns.daysLabel")}
              <input
                type="number"
                min={1}
                max={365}
                className={`${inputCls} w-20`}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                required
              />
            </label>
          )}
          {kind === "ROLE" && (
            <select
              className={inputCls}
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          {kind === "EVENT" && (
            <div className="flex flex-col gap-2">
              <input
                className={inputCls}
                placeholder={t("campaigns.searchEventPh")}
                value={eventQ}
                onChange={(e) => setEventQ(e.target.value)}
              />
              <select
                className={inputCls}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                required
              >
                <option value="">{t("campaigns.pickEvent")}</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} · {fmt(ev.startsAt)} · {ev.status}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="text-xs text-ink/50">
            {count === null
              ? t("campaigns.countLoading")
              : t("campaigns.count", { n: count })}
          </p>
          <p className="font-mono text-[11px] text-ink/40">
            {t("campaigns.varsHint", {
              vars: VARS_BY_KIND[kind].map((v) => `{{${v}}}`).join(" "),
            })}
          </p>
          {LIFECYCLE.has(kind) && (
            <p className="text-[11px] text-ink/40">
              {t("campaigns.dedupHint")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-ink/60">
            {t("campaigns.schedule")}
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="radio"
                name="sched"
                checked={scheduleKind === "ONCE"}
                onChange={() => setScheduleKind("ONCE")}
              />
              {t("campaigns.kindOnce")}
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="radio"
                name="sched"
                checked={scheduleKind === "CRON"}
                onChange={() => setScheduleKind("CRON")}
              />
              {t("campaigns.kindCron")}
            </label>
          </div>
          {scheduleKind === "ONCE" ? (
            <input
              type="datetime-local"
              className={inputCls}
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
              required
            />
          ) : (
            <>
              <input
                className={`${inputCls} font-mono`}
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 9 * * *"
                required
              />
              <div className="flex flex-wrap gap-1">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.expr}
                    type="button"
                    className="rounded-full border border-ink/15 px-2 py-1 text-xs text-ink/60 hover:border-ink/30"
                    onClick={() => setCronExpr(p.expr)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={schedule}
              onChange={(e) => setSchedule(e.target.checked)}
            />
            {t("campaigns.scheduleNow")}
          </label>
        </div>

        <div className="flex gap-2">
          <Button variant="primary" size="sm" disabled={saving}>
            {saving ? <Spinner size="sm" /> : t("campaigns.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("campaigns.close")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
