"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyTierGate } from "@/components/academy/academy-tier-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonCard,
} from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import type {
  AcademyDealView,
  AcademyPresaleCode,
} from "@/components/producer/academy-sales-section";

type AcademyDealRow = AcademyDealView & {
  eventName: string | null;
  seriesName: string | null;
  eventStartsAt: string | null;
};

const STATUS_VARIANT = {
  INVITED: "outline",
  ACTIVE: "neon",
  DECLINED: "muted",
  DISABLED: "muted",
} as const;

/**
 * /academia/preventas/[id] - ficha del acuerdo de preventa para la
 * academia: datos + comisión devengada/pagada, link copiable (?a= sobre
 * la landing del evento) y, si está INVITED, aceptar/rechazar (PATCH
 * /academy-deals/:id). No hay GET por id - se resuelve del listado.
 */
function DealDetail({
  academyId,
  agreementId,
}: {
  academyId: string;
  agreementId: string;
}) {
  const t = useTranslations("academySales");
  const tc = useTranslations("common");

  const [deal, setDeal] = useState<AcademyDealRow | null>(null);
  const [codes, setCodes] = useState<AcademyPresaleCode[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notFound" | "error">(
    "loading",
  );
  const [busy, setBusy] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/academies/${academyId}/sale-deals`);
      if (res.status === 403 || res.status === 404) {
        setState("notFound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const rows = (await res.json()) as AcademyDealRow[];
      const found = rows.find((r) => r.id === agreementId) ?? null;
      if (!found) {
        setState("notFound");
        return;
      }
      setDeal(found);
      setState("ok");
      // Códigos 100% emitidos por la academia (canal código).
      const codesRes = await apiFetch(`/academy-deals/${agreementId}/codes`);
      if (codesRes.ok) {
        setCodes((await codesRes.json()) as AcademyPresaleCode[]);
      }
    } catch {
      setState("error");
    }
  }, [academyId, agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl =
    typeof window !== "undefined" && deal?.eventId
      ? `${window.location.origin}/eventos/${deal.eventId}?a=${academyId}`
      : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice({ text: tc("error"), error: true });
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setNotice({ text: tc("error"), error: true });
    }
  }

  /** Un código por venta cobrada en efectivo (spec academy-presale-codes). */
  async function emitCode() {
    setCodeBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/academy-deals/${agreementId}/codes`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({
          text: res.status === 409 ? t("codeCapFull") : tc("error"),
          error: true,
        });
        return;
      }
      // Refetch solo de códigos: la fila nueva es el feedback - un
      // load() completo re-skeletonizaría toda la ficha.
      const codesRes = await apiFetch(`/academy-deals/${agreementId}/codes`);
      if (codesRes.ok) {
        setCodes((await codesRes.json()) as AcademyPresaleCode[]);
      }
      setNotice({ text: t("codeIssued") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setCodeBusy(false);
    }
  }

  async function respond(action: "accept" | "decline") {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/academy-deals/${agreementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setNotice({ text: tc("error"), error: true });
        return;
      }
      // Update local del estado (aceptar→ACTIVE, rechazar→DECLINED):
      // la ficha cambia de sección sin refetch ni skeleton - el PATCH
      // no recalcula stats.
      setDeal((d) =>
        d
          ? { ...d, status: action === "accept" ? "ACTIVE" : "DECLINED" }
          : d,
      );
      setNotice({ text: t("responded") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {state === "loading" && <SkeletonCard lines={4} />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {state === "notFound" && (
        <p role="alert" className="text-sm text-ink/70">
          {t("notFound")}
        </p>
      )}

      {state === "ok" && deal && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold">
              {deal.eventName ?? deal.seriesName ?? deal.id}
            </h2>
            <Badge variant={STATUS_VARIANT[deal.status] ?? "muted"}>
              {t.has(`status.${deal.status}`)
                ? t(`status.${deal.status}`)
                : deal.status}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink/50">{t("commission")}</dt>
              <dd className="tabular-nums">{deal.commissionPct}%</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("sold")}</dt>
              <dd className="tabular-nums">{deal.stats.soldTickets}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("accrued")}</dt>
              <dd>
                <PriceTag
                  amount={deal.stats.commissionAccruedClp}
                  className="tabular-nums"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("owedToProducer")}</dt>
              <dd>
                <PriceTag
                  amount={deal.stats.codeReceivableClp}
                  className="tabular-nums"
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink/50">{t("paymentState")}</dt>
              <dd className="text-sm">
                {deal.stats.pendingClp > 0
                  ? t("paymentPending")
                  : deal.stats.pendingClp < 0
                    ? t("paymentOwed")
                    : deal.stats.commissionAccruedClp > 0 ||
                        deal.stats.codeReceivableClp > 0
                      ? t("paymentSettled")
                      : "—"}
              </dd>
            </div>
          </dl>

          {deal.status === "ACTIVE" && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="text-xs text-ink/50">{t("linkLabel")}</span>
              {deal.eventId ? (
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink/70">
                    {shareUrl}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void copyLink()}
                  >
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-ink/60">{t("seriesLinkHint")}</p>
              )}
            </div>
          )}

          {/* Canal código: la academia cobra la preventa en efectivo y
              emite un código 100% por venta; el comprador lo redime en
              el checkout y la entrada queda liberada (orden $0). */}
          {deal.status === "ACTIVE" && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-ink/50">{t("codesTitle")}</span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void emitCode()}
                  disabled={codeBusy}
                >
                  {codeBusy ? tc("loading") : t("generateCode")}
                </Button>
              </div>
              <p className="text-xs text-ink/50">{t("codesDesc")}</p>
              {codes.length === 0 ? (
                <p className="text-sm text-ink/50">{t("codesEmpty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {codes.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-medium tracking-wide">
                          {c.code}
                        </code>
                        {!c.redemption && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void copyCode(c.code)}
                          >
                            {copiedCode === c.code ? t("copied") : t("copy")}
                          </Button>
                        )}
                      </div>
                      <span className="text-xs text-ink/60">
                        {c.redemption
                          ? t("codeUsedBy", {
                              name: c.redemption.buyerName ?? "—",
                            })
                          : t("codeUnused")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {deal.status === "INVITED" && (
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <p className="text-sm text-ink/70">{t("invitedDesc")}</p>
              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => void respond("accept")}
                  disabled={busy}
                >
                  {busy ? tc("loading") : t("accept")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void respond("decline")}
                  disabled={busy}
                >
                  {t("decline")}
                </Button>
              </div>
            </div>
          )}

        </Card>
      )}

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </>
  );
}

export default function AcademyPresaleDetailPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
  const t = useTranslations("academySales");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-3xl lg:px-8">
      <ConsoleHeader
        backHref="/academia/preventas"
        backLabel={t("sectionTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <AcademyTierGate academy={academy} feature="presales"><DealDetail
            key={`${academy.id}-${params.id}`}
            academyId={academy.id}
            agreementId={params.id}
          /></AcademyTierGate>
        )}
      </AcademyGate>
    </main>
  );
}
