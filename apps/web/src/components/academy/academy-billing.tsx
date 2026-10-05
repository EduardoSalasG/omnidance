"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  PriceTag,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { PAYMENT_STATUS_VARIANT } from "@/components/payments/shared";
import { planDateFmt, type Academy } from "./shared";

type BillingCycle = "MONTHLY" | "SEMIANNUAL" | "ANNUAL";

const CYCLES: BillingCycle[] = ["MONTHLY", "SEMIANNUAL", "ANNUAL"];
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

// Tiers auto-contratables — ENTERPRISE es "a convenir" (espejo de
// SELF_SERVE_ACADEMY_TIERS en apps/api/src/payments/domain/platform-tiers.ts).
const TIERS = ["STARTER", "PRO", "STUDIO"] as const;
type TierCode = (typeof TIERS)[number];
const TIER_RANK: Record<string, number> = {
  STARTER: 0,
  PRO: 1,
  STUDIO: 2,
  ENTERPRISE: 3,
};

/** GET /academies/:id/billing — vista de billing del owner (S5). */
type BillingView = {
  tier: string | null;
  cycle: BillingCycle | null;
  status: string | null;
  subscriptionId: string | null;
  pendingTier: string | null;
  pendingCycle: BillingCycle | null;
  activeStudents: number;
  maxStudents: number | null;
  nextInvoiceAt: string | null;
  trialEndsAt: string | null;
  graceDaysLeft: number | null;
  blocked: boolean;
  blockedAt: string | null;
  invoices: {
    id: string;
    refId: string;
    amount: number;
    status: string;
    createdAt: string;
    gatewayRef: string | null;
    gatewayMedia: string | null;
  }[];
};

/** POST /academies/:id/subscribe — needs_card → disclaimer Flow. */
type SubscribeResult = {
  paymentUrl: string | null;
  subscriptionId: string;
  status: "PENDING_CARD" | "ACTIVE";
};

const dayMs = 86_400_000;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

/**
 * /academia/suscripcion — billing SaaS de la academia (S6,
 * academy-saas-billing): estado del plan (tier/ciclo, alumnos vs límite,
 * próxima facturación, trial, gracia, bloqueo), contratación vía registro
 * de tarjeta Flow (interstitial honesto antes del salto), cambio de plan
 * (upgrade inmediato / downgrade agendado al fin de ciclo), cancelación a
 * fin de período e historial de invoices (Payment PLATFORM_SUB).
 * Precios y límites salen de GET /params/public (academy_tier.*) — el
 * cargo real de Flow es precio mensual-equivalente del ciclo × meses
 * (chargeSpec del service); el descuento del ciclo se calcula del precio,
 * nunca se hardcodea.
 */
export function AcademyBilling({ academy }: { academy: Academy }) {
  const t = useTranslations("academyBilling");
  const ts = useTranslations("subscriptions");
  const tc = useTranslations("common");

  const [view, setView] = useState<BillingView | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [state, setState] = useState<
    "loading" | "denied" | "error" | "ready"
  >("loading");

  // Selección del plan (compartida por contratar y cambiar plan).
  const [selTier, setSelTier] = useState<TierCode>("STARTER");
  const [selCycle, setSelCycle] = useState<BillingCycle>("MONTHLY");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registerUrl, setRegisterUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [bRes, pRes] = await Promise.all([
        apiFetch(`/academies/${academy.id}/billing`),
        apiFetch("/params/public"),
      ]);
      if (bRes.status === 403 || bRes.status === 404) {
        setState("denied");
        return;
      }
      if (!bRes.ok) {
        setState("error");
        return;
      }
      const v = (await bRes.json()) as BillingView;
      setView(v);
      if (pRes.ok) {
        setParams((await pRes.json()) as Record<string, unknown>);
      }
      // Selección inicial: plan vigente (o el pendiente agendado); si no
      // hay, el tier más chico que cabe a los alumnos activos.
      const currentTier = TIERS.includes(v.tier as TierCode)
        ? (v.tier as TierCode)
        : null;
      setSelTier(currentTier ?? "STARTER");
      setSelCycle(v.cycle ?? "MONTHLY");
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academy.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // PlatformParam.value es Json — coerce defensivo (seed los guarda
  // como números, pero nada impide strings desde /admin).
  const num = useCallback(
    (key: string): number | null => {
      const v = params[key];
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    },
    [params],
  );

  const tierMax = useCallback(
    (tier: string) => num(`academy_tier.${tier.toLowerCase()}_max_students`),
    [num],
  );
  // Precio mensual-equivalente del tier en el ciclo (ya trae el descuento
  // del ciclo — el cargo Flow es × meses).
  const tierPrice = useCallback(
    (tier: string, cycle: BillingCycle) =>
      num(`academy_tier.${tier.toLowerCase()}_${cycle.toLowerCase()}_clp`),
    [num],
  );

  const chargeTotal = useMemo(() => {
    const monthly = tierPrice(selTier, selCycle);
    return monthly != null ? monthly * CYCLE_MONTHS[selCycle] : null;
  }, [tierPrice, selTier, selCycle]);

  const hasLiveSub =
    view?.status === "ACTIVE" || view?.status === "CANCEL_PENDING";
  const activating =
    view?.status === "PENDING_CARD" ||
    view?.status === "ACTIVATING" ||
    view?.status === "FAILED_CARD";
  const trialDaysLeft =
    view?.trialEndsAt != null
      ? Math.max(
          0,
          Math.ceil(
            (new Date(view.trialEndsAt).getTime() - Date.now()) / dayMs,
          ),
        )
      : 0;
  const onTrial = !hasLiveSub && trialDaysLeft > 0;

  const currentTierKey = TIERS.includes(view?.tier as TierCode)
    ? (view?.tier as TierCode)
    : null;
  const isUpgrade =
    currentTierKey != null &&
    (TIER_RANK[selTier] ?? -1) > (TIER_RANK[currentTierKey] ?? -1);
  const selectionIsCurrent =
    currentTierKey === selTier && view?.cycle === selCycle;
  // PATCH con los valores vigentes cuando hay un cambio agendado → el
  // pending queda = plan actual (el swap recrea el mismo plan al fin de
  // ciclo — deshace el downgrade programado; la cancel remota a fin de
  // período no se puede deshacer, por eso el "revert" es así).
  const reverting = selectionIsCurrent && view?.pendingTier != null;
  const canApply = chargeTotal != null && (!selectionIsCurrent || reverting);

  async function handleSubscribe() {
    if (busy || !view || !consent) return;
    setBusy(true);
    setNotice(null);
    setRegisterUrl(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: selTier,
          cycle: selCycle,
          acceptRecurring: true,
        }),
      });
      if (!res.ok) {
        setNotice({
          text: (await errorMessage(res)) ?? t("subscribeError"),
          error: true,
        });
        return;
      }
      const data = (await res.json()) as SubscribeResult;
      if (data.status === "PENDING_CARD" && data.paymentUrl) {
        // Interstitial pre-Flow: el owner ve a dónde va ANTES del salto
        // al disclaimer de tarjeta (momento de mayor desconfianza).
        setRegisterUrl(data.paymentUrl);
        return;
      }
      setConsent(false);
      setNotice({ text: t("subscribeOk"), error: false });
      await load();
    } catch {
      setNotice({ text: t("subscribeError"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function applyChange() {
    if (busy || !view) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/subscription`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: selTier, cycle: selCycle }),
        },
      );
      if (!res.ok) {
        setNotice({
          text: (await errorMessage(res)) ?? tc("error"),
          error: true,
        });
        return;
      }
      setNotice({ text: t("applyOk"), error: false });
      await load();
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/subscription/cancel`,
        { method: "POST" },
      );
      if (!res.ok) {
        setNotice({
          text: (await errorMessage(res)) ?? tc("error"),
          error: true,
        });
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

  /**
   * Mensaje de error del server: BadRequestException con objeto
   * ({error:"tier_limit", message:"…", active, max}) responde el objeto
   * verbatim — `body.message` es el copy honesto en es-CL con el conteo;
   * errores string llegan como `{message:"…"}`. Cap a 300 chars como en
   * membership-checkout — no confiar en bodies arbitrarios.
   */
  async function errorMessage(res: Response): Promise<string | null> {
    const body = (await res.json().catch(() => null)) as {
      message?: unknown;
    } | null;
    const msg = body?.message;
    return typeof msg === "string" && msg.length > 0 && msg.length <= 300
      ? msg
      : null;
  }

  if (state === "loading") return <SkeletonList items={2} lines={2} />;
  if (state === "denied") {
    return (
      <p role="status" className="text-sm text-white/60">
        {t("noAccess")}
      </p>
    );
  }
  if (state === "error" || !view) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-red-400">
          {t("loadError")}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          ↻ {tc("retry")}
        </Button>
      </div>
    );
  }

  const graceDays = Math.max(0, view.graceDaysLeft ?? 0);

  const statusBadge = view.blocked ? (
    <Badge variant="live">{t("blocked")}</Badge>
  ) : graceDays > 0 ? (
    <Badge variant="live">{t("grace", { days: graceDays })}</Badge>
  ) : view.status === "ACTIVE" ? (
    <Badge variant="neon">{t("statusActive")}</Badge>
  ) : view.status === "CANCEL_PENDING" ? (
    <Badge variant="muted">{t("cancelPendingNoDate")}</Badge>
  ) : view.status === "PENDING_CARD" || view.status === "FAILED_CARD" ? (
    <Badge variant="outline">
      {view.status === "FAILED_CARD"
        ? t("statusFailedCard")
        : t("statusPendingCard")}
    </Badge>
  ) : view.status === "ACTIVATING" ? (
    <Badge variant="outline">{t("statusActivating")}</Badge>
  ) : onTrial ? (
    <Badge variant="outline">{t("statusTrial")}</Badge>
  ) : (
    <Badge variant="muted">{t("statusNone")}</Badge>
  );

  const nextDate = view.nextInvoiceAt
    ? planDateFmt.format(new Date(view.nextInvoiceAt))
    : null;

  const usagePct =
    view.maxStudents != null && view.maxStudents > 0
      ? Math.min(100, (view.activeStudents / view.maxStudents) * 100)
      : null;
  const usageTone =
    usagePct != null && usagePct >= 100
      ? "bg-red-400"
      : usagePct != null && usagePct >= 90
        ? "bg-amber-300"
        : "bg-neon";

  const planSelector = (
    <>
      {/* Tiers auto-contratables — card por tier con límite y precio
          del ciclo seleccionado. El que no cabe a los alumnos activos
          queda deshabilitado con el conteo (mismo motivo del 400
          tier_limit del API). */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {TIERS.map((tier) => {
          const max = tierMax(tier);
          const price = tierPrice(tier, selCycle);
          const overLimit = max != null && view.activeStudents > max;
          const selected = selTier === tier;
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={selected}
              disabled={overLimit}
              onClick={() => setSelTier(tier)}
              className={`flex min-h-11 flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? "border-neon bg-neon/15"
                  : "border-white/15 hover:border-white/30"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-semibold">{t(`tiers.${tier}`)}</span>
                {currentTierKey === tier && (
                  <Badge variant="outline" className="normal-case tracking-normal">
                    {t("tierCurrent")}
                  </Badge>
                )}
              </span>
              <span className="text-xs text-white/60">
                {overLimit
                  ? t("tierExceeded", {
                      active: view.activeStudents,
                      max: max!,
                    })
                  : max != null
                    ? t("tierUpTo", { max })
                    : t("tierUnlimited")}
              </span>
              {price != null && (
                <span className="text-sm font-semibold text-neon tabular-nums">
                  {t("perMonth", { amount: clp.format(price) })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-white/50">
        {t("enterpriseNote")}{" "}
        <a href="/soporte" className="underline underline-offset-4 hover:text-white">
          {t("enterpriseCta")}
        </a>
      </p>

      {/* Ciclo de facturación — 3 botones como el selector de Producer
          Pro: el descuento se calcula del precio real del param, no se
          hardcodea el −2%/−4% del design. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-wide text-white/50">
          {t("cycleLabel")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {CYCLES.map((c) => {
            const price = tierPrice(selTier, c);
            const base = tierPrice(selTier, "MONTHLY");
            const pct =
              c !== "MONTHLY" && price != null && base != null && base > 0
                ? Math.round((1 - price / base) * 100)
                : null;
            const selected = selCycle === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelCycle(c)}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
                  selected
                    ? "border-neon bg-neon/15 text-neon"
                    : "border-white/15 text-white/70 hover:border-white/30 hover:text-white"
                }`}
              >
                <span className="font-medium">{t(`cycles.${c}`)}</span>
                {price != null ? (
                  <span className="text-xs tabular-nums opacity-80">
                    {t("perMonth", { amount: clp.format(price) })}
                    {pct != null && pct > 0
                      ? ` · ${t("cycleDiscount", { pct })}`
                      : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-4"
    >
      <p className="text-sm text-white/50">{t("desc")}</p>

      {/* ── Estado actual ─────────────────────────────────────────── */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">
            {hasLiveSub && view.tier
              ? `${t(`tiers.${view.tier}`)}${
                  view.cycle ? ` · ${t(`cycles.${view.cycle}`)}` : ""
                }`
              : onTrial
                ? t("statusTrial")
                : view.status === "ACTIVATING"
                  ? t("statusActivating")
                  : activating
                    ? t("statusPendingCard")
                    : t("statusNone")}
          </p>
          {statusBadge}
        </div>

        {/* Alumnos activos vs límite del tier — la métrica que define el
            tier; ≥90% ámbar, al tope rojo. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-white/60">
              {view.maxStudents != null
                ? t("studentsUsage", {
                    count: view.activeStudents,
                    max: view.maxStudents,
                  })
                : t("studentsUsageUnlimited", {
                    count: view.activeStudents,
                  })}
            </span>
          </div>
          {view.maxStudents != null && view.maxStudents > 0 && (
            <div
              role="progressbar"
              aria-valuenow={view.activeStudents}
              aria-valuemax={view.maxStudents}
              className="h-2 overflow-hidden rounded-full bg-night-700"
            >
              <div
                className={`h-full rounded-full ${usageTone}`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          )}
        </div>

        {view.status === "ACTIVE" && nextDate && (
          <p className="text-sm text-white/60">
            {t("nextInvoice", { date: nextDate })}
          </p>
        )}
        {view.status === "CANCEL_PENDING" && (
          <p className="text-sm text-white/60">
            {nextDate
              ? t("cancelPending", { date: nextDate })
              : t("cancelPendingNoDate")}
          </p>
        )}
        {view.status === "ACTIVATING" && (
          <p role="status" className="flex items-center gap-2 text-sm text-white/60">
            <Spinner size="sm" />
            {t("statusActivating")}
          </p>
        )}
        {(view.status === "PENDING_CARD" ||
          view.status === "FAILED_CARD") && (
          <p className="text-sm text-white/60">{t("pendingCardHint")}</p>
        )}
        {onTrial && (
          <p className="text-sm text-white/60">
            {t("trialDaysLeft", { days: trialDaysLeft })}
          </p>
        )}
        {view.pendingTier && view.pendingCycle && (
          <p className="text-sm text-amber-300">
            {nextDate
              ? t("pendingChange", {
                  tier: t(`tiers.${view.pendingTier}`),
                  cycle: t(`cycles.${view.pendingCycle}`),
                  date: nextDate,
                })
              : t("pendingChangeNoDate", {
                  tier: t(`tiers.${view.pendingTier}`),
                  cycle: t(`cycles.${view.pendingCycle}`),
                })}
          </p>
        )}
        {view.blocked ? (
          <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-3">
            <p className="text-sm font-medium text-red-300">
              {t("blocked")}
            </p>
            <p className="mt-1 text-sm text-red-200/80">{t("blockedHint")}</p>
          </div>
        ) : (
          graceDays > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
              <p className="text-sm font-medium text-amber-300">
                {t("grace", { days: graceDays })}
              </p>
              <p className="mt-1 text-sm text-amber-200/80">
                {t("graceHint")}
              </p>
            </div>
          )
        )}
      </Card>

      {/* ── Interstitial pre-Flow ──────────────────────────────────── */}
      {registerUrl && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("cardRedirectTitle")}</h2>
          <p className="text-sm leading-relaxed text-white/70">
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
        </Card>
      )}

      {/* ── Gestión del plan vigente ──────────────────────────────── */}
      {hasLiveSub && !registerUrl && (
        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("changePlan")}
          </h2>
          {planSelector}
          {(reverting || !selectionIsCurrent) && (
            <p className="text-xs leading-relaxed text-white/50">
              {reverting
                ? t("changeRevert", {
                    tier: currentTierKey ? t(`tiers.${currentTierKey}`) : "",
                    cycle: view.cycle ? t(`cycles.${view.cycle}`) : "",
                  })
                : isUpgrade
                  ? t("changeNow")
                  : nextDate
                    ? t("changeScheduled", { date: nextDate })
                    : t("changeScheduledNoDate")}
            </p>
          )}
          <div>
            <Button
              type="button"
              size="sm"
              disabled={busy || !canApply}
              onClick={() => void applyChange()}
            >
              {busy && <Spinner size="sm" />}
              {t("apply")}
            </Button>
          </div>

          {view.status === "ACTIVE" && (
            <div className="border-t border-night-700 pt-3">
              {confirmCancel ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-white/70">
                    {t("cancelConfirm")}
                  </p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void cancel()}
                    >
                      {busy ? tc("loading") : ts("cancelYes")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmCancel(false)}
                    >
                      {ts("cancelKeep")}
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
      )}

      {/* ── Contratación — sin suscripción viva o registro pendiente ── */}
      {!hasLiveSub && view.status !== "ACTIVATING" && !registerUrl && (
        <Card className="flex flex-col gap-4">
          {planSelector}
          {chargeTotal == null ? (
            <p role="status" className="text-sm text-white/60">
              {t("subscribeError")}
            </p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-white/50">
                {t("consent", {
                  amount: clp.format(chargeTotal),
                  period: t(`period.${selCycle}`),
                })}
              </p>
              <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-white/80">
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
                disabled={busy || !consent}
                onClick={() => void handleSubscribe()}
              >
                {busy && <Spinner size="sm" />}
                {t("subscribeCharge", {
                  tier: t(`tiers.${selTier}`),
                  amount: clp.format(chargeTotal),
                  period: t(`period.${selCycle}`),
                })}
              </Button>
            </>
          )}
        </Card>
      )}

      {/* ── Invoices (Payment PLATFORM_SUB) ───────────────────────── */}
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("invoices")}
        </h2>
        {view.invoices.length === 0 ? (
          <p className="text-sm text-white/50">{t("invoicesEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-night-700">
            {view.invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-white/60 tabular-nums">
                  {planDateFmt.format(new Date(inv.createdAt))}
                </span>
                <span className="flex items-center gap-3">
                  <PriceTag amount={inv.amount} />
                  <Badge
                    variant={PAYMENT_STATUS_VARIANT[inv.status] ?? "muted"}
                  >
                    {t(`invoiceStatus.${inv.status}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
