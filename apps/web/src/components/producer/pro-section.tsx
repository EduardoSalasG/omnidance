"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, RefreshIcon, Skeleton, SkeletonList, Spinner } from "@/components/ui";
import { planDateFmt, readError } from "@/components/academy/shared";

type BillingCycle = "MONTHLY" | "SEMIANNUAL" | "ANNUAL";

const CYCLES: BillingCycle[] = ["MONTHLY", "SEMIANNUAL", "ANNUAL"];
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

/** GET /producers/:id/pro - estado Producer Pro (S5/S6). */
type ProView = {
  proTier: string;
  proTrialEndsAt: string | null;
  effectivePro: boolean;
  status: string | null;
  subscriptionId: string | null;
  tier: string | null;
  cycle: BillingCycle | null;
  pendingTier: string | null;
  pendingCycle: BillingCycle | null;
  monthlyGross: number;
  maxGross: number | null;
  nextInvoiceAt: string | null;
  canceledAt: string | null;
};

/** POST /producers/:id/pro/subscribe - needs_card → disclaimer Flow. */
type SubscribeResult = {
  paymentUrl: string | null;
  subscriptionId: string;
  status: "PENDING_CARD" | "ACTIVE";
};

// producer_tier.<key>_*_clp - el tier no se elige: lo calcula el API por
// facturación (media bruta 90d). El front lo anticipa solo para mostrar
// el precio correcto antes de llamar (los max_* son públicos).
type TierKey = "starter" | "growth";

function tierKeyOf(tierCode: string | null): TierKey | null {
  if (tierCode === "PRO_STARTER") return "starter";
  if (tierCode === "PRO_GROWTH") return "growth";
  return null;
}

const dayMs = 86_400_000;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * Sección "Producer Pro" de /productor/parametros (S6 academy-saas-
 * billing): estado de la suscripción (FREE/trial/activa/se cancela),
 * facturación media 90d vs tope del tier, selector de ciclo con
 * precios reales de GET /params/public (producer_tier.*) y contratación
 * → disclaimer de tarjeta de Flow (interstitial honesto antes del salto).
 * Gestión: cancelar a fin de período pagado.
 */
export function ProducerProSection({ producerId }: { producerId: string }) {
  const t = useTranslations("producer.pro");
  const ts = useTranslations("subscriptions");
  const tc = useTranslations("common");

  const [view, setView] = useState<ProView | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");

  const [cycle, setCycle] = useState<BillingCycle>("MONTHLY");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registerUrl, setRegisterUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [proRes, paramsRes] = await Promise.all([
        apiFetch(`/producers/${producerId}/pro`),
        apiFetch("/params/public"),
      ]);
      if (!proRes.ok) {
        setState("error");
        return;
      }
      setView((await proRes.json()) as ProView);
      if (paramsRes.ok) {
        setPrices((await paramsRes.json()) as Record<string, number>);
      }
      setState("ready");
    } catch {
      setState("error");
    }
  }, [producerId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Tier que califica la facturación actual - espejo de
  // producerTierForGross (starter_max < gross ≤ growth_max → growth).
  // Sobre el tope → null (PRO_BIG es contratación manual).
  const selfServeTier = useMemo<TierKey | null>(() => {
    if (!view) return null;
    const starterMax = prices["producer_tier.starter_max_monthly_clp"];
    const growthMax = prices["producer_tier.growth_max_monthly_clp"];
    if (starterMax == null || growthMax == null) return null;
    if (view.monthlyGross <= starterMax) return "starter";
    if (view.monthlyGross <= growthMax) return "growth";
    return null;
  }, [view, prices]);

  // Precio mensual-equivalente del ciclo para el tier autogestionado
  // (semestral/anual ya traen el descuento en el param); el cargo real
  // de Flow es monthly × meses del ciclo (chargeSpec).
  const monthlyPrice = useMemo(() => {
    if (!selfServeTier) return null;
    const v = prices[`producer_tier.${selfServeTier}_${cycle.toLowerCase()}_clp`];
    return v != null && v > 0 ? v : null;
  }, [prices, selfServeTier, cycle]);

  const chargeTotal =
    monthlyPrice != null ? monthlyPrice * CYCLE_MONTHS[cycle] : null;

  async function subscribe() {
    if (busy || !consent) return;
    setBusy(true);
    setNotice(null);
    setRegisterUrl(null);
    try {
      const res = await apiFetch(`/producers/${producerId}/pro/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycle, acceptRecurring: true }),
      });
      if (!res.ok) {
        const body = (await res.clone().json().catch(() => null)) as {
          error?: string;
        } | null;
        setNotice({
          text:
            body?.error === "tier_limit"
              ? t("tierLimit")
              : ((await readError(res)) ?? t("subscribeError")),
          error: true,
        });
        return;
      }
      const data = (await res.json()) as SubscribeResult;
      if (data.status === "PENDING_CARD" && data.paymentUrl) {
        // Interstitial: el productor ve a dónde va ANTES del salto al
        // disclaimer de tarjeta (momento de mayor desconfianza).
        setRegisterUrl(data.paymentUrl);
        return;
      }
      setNotice({ text: t("subscribeOk"), error: false });
      await load();
    } catch {
      setNotice({ text: t("subscribeError"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/producers/${producerId}/pro/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      setConfirmCancel(false);
      setNotice({ text: t("cancelOk"), error: false });
      await load();
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") return <SkeletonList items={2} lines={1} />;
  if (state === "error" || !view) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-400">
          {t("loadError")}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  const hasLiveSub = view.status === "ACTIVE" || view.status === "CANCEL_PENDING";
  const activating =
    view.status === "PENDING_CARD" || view.status === "ACTIVATING";
  const onTrial =
    view.effectivePro &&
    view.proTier === "FREE" &&
    view.proTrialEndsAt != null &&
    new Date(view.proTrialEndsAt).getTime() > Date.now();
  const trialDaysLeft = onTrial
    ? Math.max(
        1,
        Math.ceil(
          (new Date(view.proTrialEndsAt!).getTime() - Date.now()) / dayMs,
        ),
      )
    : 0;

  return (
    <section aria-label={t("sectionTitle")} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("sectionTitle")}
      </h2>

      <Card className="flex flex-col gap-4">
        {/* Estado - trial de lanzamiento, PRO activa, se cancela o FREE. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {hasLiveSub && <Badge variant="neon">PRO</Badge>}
            <p className="font-semibold">
              {hasLiveSub
                ? t(`tiers.${view.tier ?? view.proTier}`)
                : onTrial
                  ? t("status.trial")
                  : t("status.free")}
            </p>
          </div>
          {view.status === "ACTIVE" && (
            <Badge variant="neon">{t("status.active")}</Badge>
          )}
          {view.status === "CANCEL_PENDING" && (
            <Badge variant="muted">{t("status.cancelPending")}</Badge>
          )}
          {activating && <Badge variant="outline">{t("status.activating")}</Badge>}
        </div>

        {onTrial && (
          <p className="text-sm text-ink/60">
            {t("trialDaysLeft", { count: trialDaysLeft })}
          </p>
        )}
        {view.status === "CANCEL_PENDING" && (
          <p className="text-sm text-ink/60">
            {view.nextInvoiceAt
              ? t("activeUntil", {
                  date: planDateFmt.format(new Date(view.nextInvoiceAt)),
                })
              : t("cancelPendingNoDate")}
          </p>
        )}
        {view.status === "ACTIVE" && view.nextInvoiceAt && (
          <p className="text-sm text-ink/60">
            {t("nextCharge", {
              date: planDateFmt.format(new Date(view.nextInvoiceAt)),
            })}
          </p>
        )}
        {activating && (
          <p role="status" className="text-sm text-ink/60">
            {t("activatingHint")}
          </p>
        )}

        {/* Facturación media 90d - el tier Pro se calcula con ella. */}
        <dl className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink/60">{t("gross")}</dt>
            <dd>
              <PriceTag amount={view.monthlyGross} />
            </dd>
          </div>
          {view.maxGross != null && view.maxGross > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink/60">{t("grossMax")}</dt>
              <dd>
                <PriceTag amount={view.maxGross} />
              </dd>
            </div>
          )}
        </dl>

        {/* Gestión: cancelar a fin del período ya pagado. */}
        {view.status === "ACTIVE" && (
          <div className="border-t border-line pt-3">
            {confirmCancel ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink/70">{t("cancelConfirm")}</p>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void cancel()}
                  >
                    {busy ? tc("loading") : t("cancelYes")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmCancel(false)}
                  >
                    {t("cancelKeep")}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="min-h-11 rounded-lg px-1 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        )}
      </Card>

      {/* Contratación - solo sin suscripción viva. El tier no se elige:
          lo fija la facturación (PRO_STARTER/PRO_GROWTH); sobre el tope
          autogestionado la contratación es manual (PRO_BIG). */}
      {!hasLiveSub && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-ink/70">{t("pitch")}</p>
          <ul className="flex flex-col gap-1.5 text-sm text-ink/70">
            <li>· {t("benefits.analytics")}</li>
            <li>· {t("benefits.exports")}</li>
            <li>· {t("benefits.crm")}</li>
          </ul>

          {registerUrl ? (
            /* Interstitial pre-Flow: el disclaimer de tarjeta es el
               momento de mayor desconfianza - ver a dónde se va antes
               del salto de dominio (patrón membership-checkout). */
            <div className="flex flex-col gap-3">
              <h3 className="text-base font-semibold">
                {t("cardRedirectTitle")}
              </h3>
              <p className="text-sm leading-relaxed text-ink/70">
                {t("cardRedirectDesc")}
              </p>
              <Button
                type="button"
                onClick={() => {
                  window.location.href = registerUrl;
                }}
              >
                {t("cardRedirectCta")}
              </Button>
            </div>
          ) : (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs uppercase tracking-wide text-ink/50">
                  {t("cycle.label")}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {CYCLES.map((c) => {
                    const price = selfServeTier
                      ? prices[
                          `producer_tier.${selfServeTier}_${c.toLowerCase()}_clp`
                        ]
                      : null;
                    const selected = cycle === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setCycle(c)}
                        className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                          selected
                            ? "border-neon bg-neon/15 text-neon"
                            : "border-ink/15 text-ink/70 hover:border-ink/30 hover:text-ink"
                        }`}
                      >
                        <span className="font-medium">{t(`cycle.${c}`)}</span>
                        {price != null && price > 0 && (
                          <span className="text-xs tabular-nums opacity-80">
                            {t("perMonth", { amount: clp.format(price) })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {selfServeTier === null ? (
                /* Tier en vuelo → skeleton de texto, nunca copy que
                   se reemplaza por el consentimiento real. */
                <Skeleton className="page-loading h-4 w-56" />
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-ink/50">
                    {chargeTotal != null &&
                      t("consent", {
                        amount: clp.format(chargeTotal),
                        period: t(`period.${cycle}`),
                      })}
                  </p>
                  <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-neon"
                    />
                    {ts("consentCheck")}
                  </label>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy || !consent || chargeTotal == null}
                    onClick={() => void subscribe()}
                  >
                    {busy && <Spinner size="sm" />}
                    {chargeTotal != null
                      ? t("subscribe", {
                          amount: clp.format(chargeTotal),
                          period: t(`period.${cycle}`),
                        })
                      : t("subscribeNoPrice")}
                  </Button>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {notice && (
        <p
          role={notice.error ? "alert" : "status"}
          className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
        >
          {notice.text}
        </p>
      )}
    </section>
  );
}
