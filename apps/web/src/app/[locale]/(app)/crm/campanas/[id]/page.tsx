"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
} from "@/components/ui";
import { SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  CrmGateScreen,
  useCrmContext,
} from "@/components/crm/crm-context";
import {
  actionLabel,
  audienceLabel,
} from "@/components/crm/campaign-labels";
import { ProPaywall } from "@/components/producer/pro-paywall";
import { AcademyTierPaywall } from "@/components/academy/academy-tier-gate";
import type { CrmCampaign } from "@/components/crm/types";
import { useDateFmt } from "@/lib/intl";

;

const STATUS_VARIANT: Record<string, "neon" | "muted" | "outline"> = {
  DRAFT: "outline",
  SCHEDULED: "outline",
  SENT: "neon",
  DONE: "muted",
  CANCELLED: "muted",
};

// Ficha de campaña (spec crm-console-v1): datos, audiencia, acción,
// resultado y el envío del borrador - la acción masiva confirma en un
// diálogo focus-trapped (patrón bottom-sheet, no window.confirm).
export default function CrmCampanaPage() {
  const locale = useLocale();
  const fmtDay = useDateFmt({
  dateStyle: "medium",
  timeStyle: "short",
});
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const { id } = useParams<{ id: string }>();
  const ctx = useCrmContext();

  const [campaign, setCampaign] = useState<CrmCampaign | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Canal WhatsApp (spec crm-channels-digest): texto + links wa.me.
  const [waText, setWaText] = useState("");
  const [waLinks, setWaLinks] = useState<{
    items: { personId: string; name: string; phone: string; url: string }[];
    total: number;
    withoutPhone: number;
  } | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sendDialogRef = useDialogFocus<HTMLDivElement>(confirmSend, () =>
    setConfirmSend(false),
  );
  const cancelDialogRef = useDialogFocus<HTMLDivElement>(confirmCancel, () =>
    setConfirmCancel(false),
  );

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/campaigns/${id}`);
      if (res.status === 404 || res.status === 403) {
        setNotFound(true);
        setCampaign(null);
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setNotFound(false);
      setCampaign((await res.json()) as CrmCampaign);
    } catch {
      setError(true);
    }
  }, [id]);

  useEffect(() => {
    setCampaign(null);
    setNotFound(false);
    if (ctx.actor) void load();
  }, [ctx.actor, load]);

  async function doSend() {
    if (sending || !campaign) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/crm/campaigns/${campaign.id}/send`, {
        method: "POST",
      });
      if (!res.ok) return setError(true);
      const updated = (await res.json()) as CrmCampaign;
      setConfirmSend(false);
      setCampaign(updated);
      if (updated.result?.sent != null) {
        setNotice(
          t("campaigns.sentResult", { count: updated.result.sent }),
        );
      }
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  async function doCancel() {
    if (cancelling || !campaign) return;
    setCancelling(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/crm/campaigns/${campaign.id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) return setError(true);
      setConfirmCancel(false);
      setCampaign((await res.json()) as CrmCampaign);
      setNotice(t("campaigns.unscheduled"));
    } catch {
      setError(true);
    } finally {
      setCancelling(false);
    }
  }

  async function loadWaLinks() {
    if (waBusy || !campaign) return;
    setWaBusy(true);
    try {
      const params = waText.trim()
        ? `?text=${encodeURIComponent(waText.trim())}`
        : "";
      const res = await apiFetch(`/crm/campaigns/${campaign.id}/whatsapp${params}`);
      if (!res.ok) return setError(true);
      setWaLinks(
        (await res.json()) as {
          items: { personId: string; name: string; phone: string; url: string }[];
          total: number;
          withoutPhone: number;
        },
      );
    } catch {
      setError(true);
    } finally {
      setWaBusy(false);
    }
  }

  const c = campaign;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/crm/campanas"
        backLabel={t("campaigns.title")}
      />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
          ) : ctx.tierBlocked ? (
            <AcademyTierPaywall feature="crm" />
          ) : ctx.proBlocked ? (
            <ProPaywall />
          ) : c === null && !error && !notFound ? (
            <SkeletonCard lines={4} />
          ) : notFound ? (
            <p role="alert" className="text-sm text-red-400">
              {t("campaigns.notFound")}
            </p>
          ) : error || c === null ? (
            <div className="flex items-center gap-3">
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
              <Button size="sm" variant="ghost" onClick={() => void load()}>
                <RefreshIcon /> {tc("retry")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>
                    {t(`campaigns.status.${c.status}`)}
                  </Badge>
                  <Badge variant="outline">{actionLabel(t, c, locale)}</Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-ink/50">{t("campaigns.audience")}:</dt>
                    <dd>{audienceLabel(t, c)}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <dt className="text-ink/50">
                      {t("campaigns.createdAt")}:
                    </dt>
                    <dd className="tabular-nums">
                      {fmtDay.format(new Date(c.createdAt))}
                    </dd>
                  </div>
                  {c.action?.type === "NOTIFY" && c.action.title && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-ink/50">
                        {t("campaigns.notifyTitle")}:
                      </dt>
                      <dd>{c.action.title}</dd>
                    </div>
                  )}
                  {c.action?.type === "NOTIFY" && c.action.body && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="text-ink/50">
                        {t("campaigns.notifyBody")}:
                      </dt>
                      <dd>{c.action.body}</dd>
                    </div>
                  )}
                  {c.action?.type === "DISCOUNT_CODE" && (
                    <>
                      {c.action.maxUses != null && (
                        <div className="flex flex-wrap gap-2">
                          <dt className="text-ink/50">
                            {t("campaigns.maxUses")}:
                          </dt>
                          <dd className="tabular-nums">{c.action.maxUses}</dd>
                        </div>
                      )}
                      {c.action.amountOff != null && (
                        <div className="flex flex-wrap gap-2">
                          <dt className="text-ink/50">
                            {t("campaigns.amountOff")}:
                          </dt>
                          <dd>
                            <PriceTag amount={c.action.amountOff} />
                          </dd>
                        </div>
                      )}
                      {c.action.expiresAt && (
                        <div className="flex flex-wrap gap-2">
                          <dt className="text-ink/50">
                            {t("campaigns.expiresAt")}:
                          </dt>
                          <dd className="tabular-nums">
                            {fmtDay.format(new Date(c.action.expiresAt))}
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
                {c.scheduledAt && c.status === "SCHEDULED" && (
                  <p className="text-sm text-ink/60">
                    {t("campaigns.scheduledFor", {
                      date: fmtDay.format(new Date(c.scheduledAt)),
                    })}
                  </p>
                )}
                {c.status === "SENT" && c.result && (
                  <p className="text-sm text-neon">
                    {t("campaigns.sentResult", {
                      count: c.result.sent ?? 0,
                    })}
                    {c.result.code
                      ? ` · ${t("campaigns.withCode", { code: c.result.code })}`
                      : ""}
                  </p>
                )}
              </Card>

              {/* Atribución (spec crm-campaign-ops): respondieron = volvieron
                  a la actividad del actor tras el envío; canjearon = pagos
                  PAID con el código creado por la campaña. */}
              {c.status === "SENT" && c.metrics && (
                <Card className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">
                    {t("campaigns.metricsTitle")}
                  </h3>
                  <dl className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <dt className="text-xs text-ink/50">
                        {t("campaigns.metricSent")}
                      </dt>
                      <dd className="font-mono text-xl font-bold tabular-nums">
                        {c.metrics.sent}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink/50">
                        {t("campaigns.metricEngaged")}
                      </dt>
                      <dd className="font-mono text-xl font-bold tabular-nums text-neon">
                        {c.metrics.engaged ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-ink/50">
                        {t("campaigns.metricRedemptions")}
                      </dt>
                      <dd className="font-mono text-xl font-bold tabular-nums text-neon">
                        {c.metrics.redemptions ?? "—"}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs text-ink/50">
                    {t("campaigns.metricsHint")}
                  </p>
                </Card>
              )}

              {/* Canal WhatsApp (spec crm-channels-digest): el actor
                  compone el texto y abre cada chat wa.me - semi-manual
                  honesto hasta la API oficial de WhatsApp. */}
              {c.status === "SENT" && (
                <Card className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold">
                    {t("campaigns.whatsappTitle")}
                  </h3>
                  <label className="flex flex-col gap-2">
                    <span className="text-xs text-ink/50">
                      {t("campaigns.whatsappText")}
                    </span>
                    <textarea
                      rows={2}
                      value={waText}
                      onChange={(e) => setWaText(e.target.value)}
                      className="min-h-16 w-full rounded-lg border border-line bg-canvas px-3 py-3 text-sm text-ink focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50"
                    />
                  </label>
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={waBusy}
                      onClick={() => void loadWaLinks()}
                    >
                      {waBusy ? tc("loading") : t("campaigns.whatsappLoad")}
                    </Button>
                  </div>
                  {/* La lista se arma al click - live region para que
                      la aparición se anuncie al lector de pantalla. */}
                  <div aria-live="polite">
                    {waLinks !== null && (
                    <>
                      {waLinks.items.length === 0 ? (
                        <p className="text-sm text-ink/60">
                          {t("campaigns.whatsappEmpty")}
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-2">
                          {waLinks.items.map((w) => (
                            <li key={w.personId}>
                              <a
                                href={w.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                              >
                                <span className="font-medium">{w.name}</span>
                                <span className="text-xs tabular-nums text-ink/50">
                                  {w.phone}
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                      {waLinks.withoutPhone > 0 && (
                        <p className="text-xs text-ink/50">
                          {t("campaigns.whatsappNoPhone", {
                            count: waLinks.withoutPhone,
                          })}
                        </p>
                      )}
                    </>
                    )}
                  </div>
                </Card>
              )}

              <div aria-live="polite">
                {notice && (
                  <p role="status" className="text-sm text-neon">
                    {notice}
                  </p>
                )}
              </div>

              {(c.status === "DRAFT" || c.status === "SCHEDULED") && (
                <div className="flex justify-center gap-3 border-t border-line pt-6">
                  {c.status === "SCHEDULED" && (
                    <Button
                      variant="ghost"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => setConfirmCancel(true)}
                    >
                      {t("campaigns.cancelSchedule")}
                    </Button>
                  )}
                  <Button onClick={() => setConfirmSend(true)}>
                    {t("campaigns.send")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Confirmación de envío masivo - bottom sheet (mismo patrón que
          el de cancelación de evento). */}
      {confirmSend && c && (
        <div
          ref={sendDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmSend(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-campaign-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="send-campaign-title" className="text-lg font-semibold">
              {t("campaigns.sendTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              {t("campaigns.sendDesc")}
            </p>
            <p className="mt-3 text-sm font-medium">{c.name}</p>
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                className="flex-1"
                disabled={sending}
                onClick={() => void doSend()}
              >
                {sending ? t("campaigns.sending") : t("campaigns.send")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmSend(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Confirmación de desprogramar - bottom sheet. */}
      {confirmCancel && c && (
        <div
          ref={cancelDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmCancel(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-campaign-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cancel-campaign-title" className="text-lg font-semibold">
              {t("campaigns.cancelTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              {t("campaigns.cancelDesc")}
            </p>
            <p className="mt-3 text-sm font-medium">{c.name}</p>
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                className="flex-1 bg-red-500 hover:bg-red-400"
                disabled={cancelling}
                onClick={() => void doCancel()}
              >
                {cancelling ? tc("loading") : t("campaigns.cancelSchedule")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmCancel(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </main>
  );
}
