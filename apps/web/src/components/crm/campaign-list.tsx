"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type { CrmActor, CrmCampaign } from "./types";
import { actorQuery } from "./types";

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

/**
 * Cards de campañas del actor (GET /crm/campaigns?actor). Acción disponible:
 * Enviar (POST /:id/send, solo DRAFT — con confirmación, es masiva).
 * El controller no expone DELETE/CANCEL — no hay acción de cancelar en v1.
 */
export function CampaignList({
  actor,
  reloadSignal,
}: {
  actor: CrmActor;
  /** Incrementar para forzar refetch (tras crear una campaña). */
  reloadSignal: number;
}) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");

  const [items, setItems] = useState<CrmCampaign[] | null>(null);
  const [error, setError] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/crm/campaigns?${actorQuery(actor)}`);
      if (!res.ok) {
        setError(true);
        setItems([]);
        return;
      }
      setItems((await res.json()) as CrmCampaign[]);
    } catch {
      setError(true);
      setItems([]);
    }
  }, [actor]);

  useEffect(() => {
    setItems(null);
    void load();
  }, [load, reloadSignal]);

  async function send(c: CrmCampaign) {
    if (sending) return;
    if (!window.confirm(t("campaigns.sendConfirm", { name: c.name }))) return;
    setSending(c.id);
    setNotice(null);
    try {
      const res = await apiFetch(`/crm/campaigns/${c.id}/send`, {
        method: "POST",
      });
      if (!res.ok) return setError(true);
      const updated = (await res.json()) as CrmCampaign;
      setNotice(
        t("campaigns.sentResult", { count: updated.result?.sent ?? 0 }),
      );
      await load();
    } catch {
      setError(true);
    } finally {
      setSending(null);
    }
  }

  function audienceLabel(c: CrmCampaign): string {
    const parts: string[] = [];
    if (c.segment?.segment) {
      parts.push(
        t.has(`segments.${c.segment.segment}`)
          ? t(`segments.${c.segment.segment}`)
          : c.segment.segment,
      );
    }
    if (c.segment?.tags?.length) parts.push(c.segment.tags.join(", "));
    if (c.segment?.personIds?.length) {
      parts.push(`${c.segment.personIds.length} id`);
    }
    return parts.join(" + ") || t("campaigns.audienceAll");
  }

  function actionLabel(c: CrmCampaign): string {
    if (c.action?.type === "DISCOUNT_CODE") {
      const off =
        c.action.percentOff != null
          ? `−${c.action.percentOff}%`
          : c.action.amountOff != null
            ? `−$${c.action.amountOff.toLocaleString("es-CL")}`
            : "";
      return `${t("campaigns.types.DISCOUNT_CODE")} ${off}`.trim();
    }
    return t("campaigns.types.NOTIFY");
  }

  if (items === null && !error) {
    return <PageLoading />;
  }

  return (
    <section className="flex flex-col gap-4" aria-label={t("campaigns.title")}>
      <div aria-live="polite">
        {notice && <p className="text-sm text-neon">{notice}</p>}
      </div>
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <p className="text-white/60">{t("campaigns.empty")}</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <Badge variant={STATUS_VARIANT[c.status] ?? "muted"}>
                    {t.has(`campaigns.status.${c.status}`)
                      ? t(`campaigns.status.${c.status}`)
                      : c.status}
                  </Badge>
                  <Badge variant="outline">{actionLabel(c)}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
                  <span>
                    {t("campaigns.audience")}: {audienceLabel(c)}
                  </span>
                  <span className="text-white/50">
                    {fmtDay.format(new Date(c.createdAt))}
                  </span>
                </div>
                {c.status === "SENT" && c.result && (
                  <p className="text-sm text-neon">
                    {t("campaigns.sentResult", { count: c.result.sent ?? 0 })}
                    {c.result.code
                      ? ` · ${t("campaigns.withCode", { code: c.result.code })}`
                      : ""}
                  </p>
                )}
                {c.status === "DRAFT" && (
                  <Button
                    size="sm"
                    className="self-start"
                    disabled={sending !== null}
                    onClick={() => void send(c)}
                  >
                    {sending === c.id
                      ? t("campaigns.sending")
                      : t("campaigns.send")}
                  </Button>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
