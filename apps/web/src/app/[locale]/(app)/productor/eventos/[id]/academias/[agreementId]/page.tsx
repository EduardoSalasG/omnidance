"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { getNumFmt } from "@/lib/intl";
import { useDialogFocus } from "@/lib/useDialogFocus";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  RefreshIcon,
  SkeletonCard,
} from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import {
  inputCls,
  readError,
} from "@/components/producer/shared";
import type {
  AcademyDealView,
  AcademyPresaleCode,
} from "@/components/producer/academy-sales-section";

const STATUS_VARIANT = {
  INVITED: "outline",
  ACTIVE: "neon",
  DECLINED: "muted",
  DISABLED: "muted",
} as const;

/**
 * /productor/eventos/[id]/academias/[agreementId] - ficha del acuerdo de
 * preventa (spec academy-presale-commission): datos + stats, link
 * copiable (?a=), edición de % y cupo (solo órdenes futuras), marcar la
 * deuda pendiente como pagada con comprobante opcional y desactivar en
 * zona destructiva. El listado del evento no tiene GET por id - se
 * resuelve desde GET /events/:id/academy-deals filtrando por id.
 */
function DealDetail({
  eventId,
  agreementId,
}: {
  eventId: string;
  agreementId: string;
}) {
  const locale = useLocale();
  const t = useTranslations("academySales");
  const tp = useTranslations("producer");
  const tc = useTranslations("common");

  const [deal, setDeal] = useState<AcademyDealView | null>(null);
  const [codes, setCodes] = useState<AcademyPresaleCode[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notFound" | "error">(
    "loading",
  );

  // Edición (solo ventas futuras - el snapshot vive en cada Payment).
  const [commissionPct, setCommissionPct] = useState("");
  const [maxTickets, setMaxTickets] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const disableDialogRef = useDialogFocus<HTMLDivElement>(confirmDisable);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/events/${eventId}/academy-deals`);
      if (res.status === 404 || res.status === 403) {
        setState("notFound");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      const rows = (await res.json()) as AcademyDealView[];
      const found = rows.find((r) => r.id === agreementId) ?? null;
      if (!found) {
        setState("notFound");
        return;
      }
      setDeal(found);
      setCommissionPct(String(found.commissionPct));
      setMaxTickets(found.maxTickets != null ? String(found.maxTickets) : "");
      setState("ok");
      // Códigos emitidos por la academia (canal código) - auditables
      // también por el productor dueño del evento.
      const codesRes = await apiFetch(`/academy-deals/${agreementId}/codes`);
      if (codesRes.ok) {
        setCodes((await codesRes.json()) as AcademyPresaleCode[]);
      }
    } catch {
      setState("error");
    }
  }, [eventId, agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!confirmDisable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmDisable(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmDisable]);

  const shareUrl =
    typeof window !== "undefined" && deal
      ? `${window.location.origin}/eventos/${eventId}?a=${deal.academyId}`
      : "";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFormError(tc("error"));
    }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/academy-deals/${agreementId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return false;
      }
      return true;
    } catch {
      setFormError(tc("error"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTerms(e: React.FormEvent) {
    e.preventDefault();
    const pct = Number(commissionPct);
    if (!Number.isInteger(pct) || pct < 1 || pct > 90) return;
    const cap = maxTickets.trim() === "" ? null : Number(maxTickets);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1)) return;
    if (await patch({ commissionPct: pct, maxTickets: cap })) {
      setNotice(t("updated"));
      await load();
    }
  }

  async function markPaid() {
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      const res = await apiFetch(`/academy-deals/${agreementId}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {},
        ),
      });
      if (!res.ok) {
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setEvidenceUrl("");
      // El saldo es bidireccional: > 0 se pagó comisión a la academia,
      // < 0 se cobró la cuenta por cobrar del canal código.
      setNotice(
        (deal?.stats.pendingClp ?? 0) > 0
          ? t("paidMarked")
          : t("collectedMarked"),
      );
      await load();
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (await patch({ action: "disable" })) {
      setConfirmDisable(false);
      setNotice(t("disabled"));
      await load();
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref={`/productor/eventos/${eventId}`}
        backLabel={t("sectionTitle")}
      />

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
        <>
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">{deal.academyName}</h2>
              <Badge variant={STATUS_VARIANT[deal.status] ?? "muted"}>
                {t.has(`status.${deal.status}`)
                  ? t(`status.${deal.status}`)
                  : deal.status}
              </Badge>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink/50">{t("sold")}</dt>
                <dd className="tabular-nums">{deal.stats.soldTickets}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">{t("codesEmitted")}</dt>
                <dd className="tabular-nums">{deal.stats.codesEmitted}</dd>
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
                <dt className="text-xs text-ink/50">{t("receivable")}</dt>
                <dd>
                  <PriceTag
                    amount={deal.stats.codeReceivableClp}
                    className="tabular-nums"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">{t("settled")}</dt>
                <dd>
                  <PriceTag
                    amount={deal.stats.settledClp}
                    className="tabular-nums"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink/50">
                  {deal.stats.pendingClp >= 0
                    ? t("pending")
                    : t("pendingCollect")}
                </dt>
                <dd>
                  <PriceTag
                    amount={Math.abs(deal.stats.pendingClp)}
                    className="tabular-nums font-semibold"
                  />
                </dd>
              </div>
            </dl>

            {/* Link de venta: ?a=<academyId> sobre la landing del evento.
                En acuerdo de serie el mismo link atribuye desde cualquier
                evento de la serie (el eventId del path es el contexto). */}
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="text-xs text-ink/50">{t("linkLabel")}</span>
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
            </div>
          </Card>

          {/* Edición de términos - aplica solo a órdenes futuras (la
              comisión queda congelada por orden al pagarse). */}
          <Card>
            <form onSubmit={saveTerms} className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                {t("editTerms")}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">
                    {t("commissionPct")}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    step={1}
                    inputMode="numeric"
                    required
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(e.target.value)}
                    className={inputCls}
                    disabled={deal.status === "DISABLED"}
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">{t("maxTickets")}</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={maxTickets}
                    onChange={(e) => setMaxTickets(e.target.value)}
                    className={inputCls}
                    disabled={deal.status === "DISABLED"}
                  />
                </label>
              </div>
              {deal.status !== "DISABLED" && (
                <Button type="submit" disabled={busy} className="self-start">
                  {busy ? tc("loading") : tc("save")}
                </Button>
              )}
            </form>
          </Card>

          {/* Códigos emitidos por la academia (canal código): cada
              venta cobrada en efectivo por la academia deja un código
              100% redimido en el checkout - el productor audita aquí
              quién lo usó y bajo qué pago. */}
          {(codes.length > 0 || deal.stats.codesEmitted > 0) && (
            <Card className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                {t("codesTitle")}
              </h3>
              {codes.length === 0 ? (
                <p className="text-sm text-ink/50">{t("codesEmpty")}</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {codes.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <code className="text-sm font-medium tracking-wide">
                        {c.code}
                      </code>
                      <span className="text-xs text-ink/60">
                        {c.redemption ? (
                          <>
                            {t("codeUsedBy", {
                              name: c.redemption.buyerName ?? "—",
                            })}
                            {c.redemption.paymentRefId &&
                              ` · Nº ${c.redemption.paymentRefId.slice(0, 12)}`}
                          </>
                        ) : (
                          t("codeUnused")
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {/* Regularización offline del saldo signed: > 0 el productor
              le pagó comisión a la academia; < 0 la academia le pagó al
              productor por las preventas cobradas con códigos. La marca
              queda con comprobante opcional; remanentes nuevos vuelven a
              aparecer. */}
          {deal.stats.pendingClp !== 0 && deal.status !== "DISABLED" && (
            <Card className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
                {deal.stats.pendingClp > 0
                  ? t("markPaidTitle")
                  : t("markCollectTitle")}
              </h3>
              <p className="text-sm text-ink/60">
                {deal.stats.pendingClp > 0
                  ? t("markPaidDesc", {
                      amount: `$${getNumFmt(locale).format(deal.stats.pendingClp)}`,
                      academy: deal.academyName,
                    })
                  : t("markCollectDesc", {
                      amount: `$${getNumFmt(locale).format(Math.abs(deal.stats.pendingClp))}`,
                      academy: deal.academyName,
                    })}
              </p>
              <label className="flex flex-col gap-2">
                <span className="text-sm text-ink/70">{t("evidenceUrl")}</span>
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  className={inputCls}
                  placeholder="https://"
                />
              </label>
              <Button
                type="button"
                onClick={() => void markPaid()}
                disabled={busy}
                className="self-start"
              >
                {busy
                  ? tc("loading")
                  : deal.stats.pendingClp > 0
                    ? t("markPaid")
                    : t("markCollected")}
              </Button>
            </Card>
          )}

          <div aria-live="polite">
            {notice && (
              <p role="status" className="text-sm font-medium text-neon">
                {notice}
              </p>
            )}
            {formError && (
              <p role="alert" className="text-sm text-red-400">
                {formError}
              </p>
            )}
          </div>

          {/* Zona destructiva - desactivar mata la atribución futura, no
              las órdenes ya pagadas ni la deuda devengada. */}
          {deal.status === "ACTIVE" && (
            <section className="flex justify-center border-t border-line pt-6">
              <Button
                size="sm"
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() => setConfirmDisable(true)}
                disabled={busy}
              >
                {t("disable")}
              </Button>
            </section>
          )}
        </>
      )}

      {confirmDisable && deal && (
        <div
          ref={disableDialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-canvas/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirmDisable(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="disable-deal-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="disable-deal-title" className="text-lg font-semibold">
              {t("disableConfirmTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink/60">
              {t("disableConfirmDesc", { academy: deal.academyName })}
            </p>
            <div className="mt-4 flex gap-3">
              <Button
                type="button"
                className="flex-1"
                disabled={busy}
                onClick={() => void disable()}
              >
                {busy ? tc("loading") : t("disable")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDisable(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

export default function AcademyDealDetailPage(
  props: {
    params: Promise<{ id: string; agreementId: string }>;
  }
) {
  const params = use(props.params);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <DealDetail eventId={params.id} agreementId={params.agreementId} />
      </ProducerGate>
    </main>
  );
}
