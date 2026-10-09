"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  ActorPicker,
  CrmGateScreen,
  CrmNav,
  useCrmContext,
} from "@/components/crm/crm-context";
import {
  actionLabel,
  audienceLabel,
} from "@/components/crm/campaign-labels";
import { ProPaywall } from "@/components/producer/pro-paywall";
import type { CrmCampaign } from "@/components/crm/types";

const fmtDay = new Intl.DateTimeFormat("es-CL", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_VARIANT: Record<string, "neon" | "muted" | "outline"> = {
  DRAFT: "outline",
  SENT: "neon",
  DONE: "muted",
  CANCELLED: "muted",
};

// Ficha de campaña (spec crm-console-v1): datos, audiencia, acción,
// resultado y el envío del borrador - la acción masiva confirma en un
// diálogo focus-trapped (patrón bottom-sheet, no window.confirm).
export default function CrmCampanaPage() {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const { id } = useParams<{ id: string }>();
  const ctx = useCrmContext();

  const [campaign, setCampaign] = useState<CrmCampaign | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const sendDialogRef = useDialogFocus<HTMLDivElement>(confirmSend);

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

  const c = campaign;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 pb-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader
        backHref="/crm/campanas"
        backLabel={t("campaigns.title")}
      />
      <CrmNav active="campaigns" />

      <CrmGateScreen gate={ctx.gate} onRetry={() => void ctx.boot()} />

      {ctx.gate === "ready" && (
        <>
          <ActorPicker ctx={ctx} />
          {!ctx.actor ? (
            <p className="text-ink/60">{t("pickActor")}</p>
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
                  <Badge variant="outline">{actionLabel(t, c)}</Badge>
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

              <div aria-live="polite">
                {notice && <p className="text-sm text-neon">{notice}</p>}
              </div>

              {c.status === "DRAFT" && (
                <section className="flex justify-center border-t border-line pt-6">
                  <Button onClick={() => setConfirmSend(true)}>
                    {t("campaigns.send")}
                  </Button>
                </section>
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
    </main>
  );
}
