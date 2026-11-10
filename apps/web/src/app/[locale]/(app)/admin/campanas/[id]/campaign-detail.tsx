"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { readError } from "@/components/academy/shared";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  ConfirmSheet,
  LIST_PREVIEW,
  SeeAllRow,
  SkeletonCard,
} from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { ConsoleHeader } from "@/components/console/console-header";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";
import type { Campaign } from "@/components/admin/campaign-form";

// Ficha de campaña (change admin-campaign-detail): detalle + historial
// de corridas + acciones de operación (probar / enviar ahora /
// cancelar). El listado solo navega - las mutaciones viven acá
// (console-patterns §3-4).

type CampaignRun = {
  id: string;
  trigger: "CRON" | "MANUAL";
  status: "RUNNING" | "OK" | "ERROR" | "CANCELLED";
  sentCount: number;
  failCount: number;
  startedAt: string;
  finishedAt: string | null;
  _count: { recipients: number };
};

export function CampaignDetail({ id }: { id: string }) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const dt = useDateFmt({ dateStyle: "short", timeStyle: "short" });
  const fmt = (iso: string | null) =>
    iso ? dt.format(new Date(iso)) : "—";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [runs, setRuns] = useState<CampaignRun[] | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [busy, setBusy] = useState<"test" | "run" | "cancel" | null>(null);
  const [pending, setPending] = useState<"run" | "cancel" | null>(null);
  const [expandedRuns, setExpandedRuns] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, rRes] = await Promise.all([
        apiFetch(`/admin/mail-campaigns/${id}`),
        apiFetch(`/admin/mail-campaigns/${id}/runs`),
      ]);
      if (cRes.status === 404) {
        setNotFound(true);
        setCampaign(null);
        setRuns(null);
        return;
      }
      if (!cRes.ok) {
        setError((await readError(cRes)) ?? tc("error"));
        setCampaign(null);
        setRuns(null);
        return;
      }
      setCampaign(await cRes.json());
      setRuns(rRes.ok ? ((await rRes.json()) as CampaignRun[]) : []);
    } catch {
      setError(tc("error"));
      setCampaign(null);
      setRuns(null);
    } finally {
      setLoading(false);
    }
  }, [id, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: "test" | "run" | "cancel") {
    setBusy(action);
    setNotice(null);
    try {
      const res = await apiFetch(`/admin/mail-campaigns/${id}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({
          text: (await readError(res)) ?? tc("error"),
          error: true,
        });
      } else {
        setNotice({
          text: t(
            action === "test"
              ? "campaigns.testSent"
              : action === "run"
                ? "campaigns.runStarted"
                : "campaigns.cancelled",
          ),
        });
        await load();
      }
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(null);
      setPending(null);
    }
  }

  const editable = (c: Campaign) =>
    c.status === "DRAFT" || c.status === "SCHEDULED";
  const cancellable = (c: Campaign) =>
    c.status === "DRAFT" || c.status === "SCHEDULED" || c.status === "SENDING";

  function statusBadge(s: Campaign["status"]) {
    const map: Record<
      Campaign["status"],
      "muted" | "neon" | "live" | "outline"
    > = {
      DRAFT: "muted",
      SCHEDULED: "neon",
      SENDING: "neon",
      DONE: "outline",
      FAILED: "live",
      CANCELLED: "muted",
    };
    return <Badge variant={map[s]}>{t(`campaigns.status.${s}`)}</Badge>;
  }

  function runStatusBadge(s: CampaignRun["status"]) {
    const map: Record<
      CampaignRun["status"],
      "muted" | "neon" | "live" | "outline"
    > = {
      RUNNING: "neon",
      OK: "outline",
      ERROR: "live",
      CANCELLED: "muted",
    };
    return (
      <Badge variant={map[s]}>{t(`campaigns.runs.status.${s}`)}</Badge>
    );
  }

  function audienceLabel(c: Campaign) {
    const a = c.audience;
    if (a.kind === "ALL") return t("campaigns.audienceAll");
    if (a.kind === "ROLE")
      return t("campaigns.audienceRole", { role: a.roleKey ?? "" });
    if (a.kind === "EVENT")
      return t("campaigns.audienceEvent", {
        event: a.eventId?.slice(0, 8) ?? "",
      });
    return t("campaigns.audienceLifecycle", {
      label: t(`campaigns.kind.${a.kind}`),
      days: String(a.days ?? 7),
    });
  }

  function scheduleLabel(c: Campaign) {
    if (c.scheduleKind === "ONCE")
      return t("campaigns.scheduleOnce", { at: fmt(c.runAt) });
    return `${c.cronExpr} (${c.timezone})`;
  }

  const visibleRuns = runs
    ? expandedRuns
      ? runs
      : runs.slice(0, LIST_PREVIEW)
    : [];

  return (
    <>
      <ConsoleHeader
        backHref="/admin/campanas"
        backLabel={t("campaigns.title")}
      />
      {loading ? (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : notFound ? (
        <Card className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-ink/60">
            {t("campaigns.detail.notFound")}
          </p>
          <Button variant="secondary" size="sm" href="/admin/campanas">
            {t("campaigns.detail.backToList")}
          </Button>
        </Card>
      ) : error ? (
        <Card
          role="alert"
          className="flex flex-col items-start gap-3 border-red-500/40 p-4"
        >
          <p className="text-sm text-red-300">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {tc("retry")}
          </Button>
        </Card>
      ) : campaign ? (
        <>
          {editable(campaign) ? (
            <Link
              href={`/admin/campanas/nueva?edit=${campaign.id}`}
              className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold group-hover:text-neon">
                    {campaign.name}
                  </h2>
                  <p className="text-sm text-ink/60">{campaign.subject}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(campaign.status)}
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-ink/40 group-hover:text-neon" />
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">
                  {campaign.name}
                </h2>
                <p className="text-sm text-ink/60">{campaign.subject}</p>
              </div>
              {statusBadge(campaign.status)}
            </div>
          )}

          <Card className="p-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.audience")}
                </dt>
                <dd className="text-ink/80">{audienceLabel(campaign)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.schedule")}
                </dt>
                <dd className="text-ink/80">{scheduleLabel(campaign)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.counters")}
                </dt>
                <dd className="tabular-nums text-ink/80">
                  {campaign.sentCount} ✓ / {campaign.failCount} ✗
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.detail.nextRun")}
                </dt>
                <dd className="tabular-nums text-ink/80">
                  {fmt(campaign.nextRunAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.detail.lastRun")}
                </dt>
                <dd className="tabular-nums text-ink/80">
                  {fmt(campaign.lastRunAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {t("campaigns.detail.created")}
                </dt>
                <dd className="tabular-nums text-ink/80">
                  {fmt(campaign.createdAt)}
                </dd>
              </div>
            </dl>
          </Card>

          <details className="rounded-xl border border-ink/10">
            <summary className="cursor-pointer p-3 text-xs text-ink/60">
              {t("campaigns.preview")}
            </summary>
            <iframe
              sandbox=""
              title={t("campaigns.preview")}
              srcDoc={campaign.htmlBody}
              // bg-white literal: documento de email, no superficie de UI.
              className="h-64 w-full rounded-b-xl bg-white"
            />
          </details>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">
              {t("campaigns.runs.title")}
            </h3>
            {runs && runs.length === 0 ? (
              <Card className="p-4 text-sm text-ink/60">
                {t("campaigns.runs.empty")}
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {visibleRuns.map((r) => (
                  <li key={r.id}>
                    <Card className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge variant="muted">
                          {t(`campaigns.runs.trigger.${r.trigger}`)}
                        </Badge>
                        <span className="truncate tabular-nums text-ink/80">
                          {fmt(r.startedAt)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums text-ink/80">
                          {r.sentCount} ✓ / {r.failCount} ✗
                        </span>
                        <span className="text-xs text-ink/50">
                          {t("campaigns.runs.recipients", {
                            n: r._count.recipients,
                          })}
                        </span>
                        {runStatusBadge(r.status)}
                      </div>
                    </Card>
                  </li>
                ))}
                {runs && runs.length > LIST_PREVIEW && (
                  <SeeAllRow
                    total={runs.length}
                    expanded={expandedRuns}
                    onToggle={() => setExpandedRuns((v) => !v)}
                  />
                )}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === "test"}
              onClick={() => void act("test")}
            >
              {busy === "test" ? <Spinner size="sm" /> : t("campaigns.test")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={
                busy === "run" ||
                campaign.status === "SENDING" ||
                campaign.status === "CANCELLED"
              }
              onClick={() => setPending("run")}
            >
              {busy === "run" ? (
                <Spinner size="sm" />
              ) : (
                t("campaigns.runNow")
              )}
            </Button>
          </div>

          {cancellable(campaign) && (
            <div className="flex justify-center border-t border-line pt-6">
              <Button
                variant="ghost"
                size="sm"
                className="text-red-400 hover:text-red-300"
                disabled={busy === "cancel"}
                onClick={() => setPending("cancel")}
              >
                {busy === "cancel" ? (
                  <Spinner size="sm" />
                ) : (
                  t("campaigns.cancel")
                )}
              </Button>
            </div>
          )}
        </>
      ) : null}

      <ConfirmSheet
        open={pending !== null}
        title={
          pending === "run"
            ? t("campaigns.runConfirm")
            : t("campaigns.cancelConfirm")
        }
        confirmLabel={
          pending === "run" ? t("campaigns.runNow") : t("campaigns.cancel")
        }
        busy={pending !== null && busy === pending}
        onConfirm={() => pending && void act(pending)}
        onClose={() => setPending(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}
