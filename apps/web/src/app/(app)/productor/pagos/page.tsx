"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  ArrowUpRightIcon,
  BackLink,
  Badge,
  Button,
  Card,
  EventDate,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import {
  PAYOUT_STATUS_VARIANT,
  PRODUCER_ROLES,
  type Payout,
  type PayoutLine,
} from "@/components/producer/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

/**
 * Agrupa las líneas de deducción por tipo (spec producer-fee-model):
 * cada línea rastrea a una orden, pero la vista resume por concepto -
 * [type, total, órdenes].
 */
function groupLines(lines: PayoutLine[]): [string, number, number][] {
  const byType = new Map<string, { total: number; count: number }>();
  for (const l of lines) {
    const g = byType.get(l.type) ?? { total: 0, count: 0 };
    g.total += l.amount;
    g.count += 1;
    byType.set(l.type, g);
  }
  return [...byType.entries()].map(([type, g]) => [
    type,
    g.total,
    g.count,
  ]);
}

/**
 * /productor/pagos - liquidaciones del productor (GET /me/payouts,
 * requiere permiso crm.manage del rol PRODUCER).
 */
export default function ProducerPayoutsPage() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  // /me compartido (MeProvider) - el gate se deriva del contexto y las
  // liquidaciones se piden en paralelo desde el mount (un no-productor
  // recibe 403 → el gate por rol decide, se descarta).
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => PRODUCER_ROLES.has(r))
          ? "notProducer"
          : "ready";
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const [listError, setListError] = useState(false);
  const [listNonce, setListNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me/payouts")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setListError(true);
          return;
        }
        setListError(false);
        setPayouts((await res.json()) as Payout[]);
      })
      .catch(() => {
        if (!cancelled) setListError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [listNonce]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 lg:max-w-5xl lg:px-8">
      <BackLink href="/productor">{t("title")}</BackLink>

      {gate === "loading" && <SkeletonList items={3} />}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("notProducer")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-ink/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={() => void refreshMe()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && listError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPayouts(null);
              setListError(false);
              setListNonce((n) => n + 1);
            }}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && !listError && payouts === null && (
        <SkeletonList items={3} />
      )}

      {gate === "ready" && !listError && payouts !== null && payouts.length === 0 && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p role="status" className="text-ink/70">
            {t("payoutsPage.empty")}
          </p>
        </Card>
      )}

      {gate === "ready" && !listError && payouts !== null && payouts.length > 0 && (
        <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
          {payouts.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-ink/50">
                      {t("payoutsPage.period")}
                    </p>
                    <p className="font-medium">
                      <EventDate start={p.periodStart} variant="compact" />
                      {" – "}
                      <EventDate start={p.periodEnd} variant="compact" />
                    </p>
                  </div>
                  <Badge variant={PAYOUT_STATUS_VARIANT[p.status] ?? "muted"}>
                    {t.has(`payoutsPage.status.${p.status}`)
                      ? t(`payoutsPage.status.${p.status}`)
                      : p.status}
                  </Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-ink/50">
                      {t("payoutsPage.gross")}
                    </dt>
                    <dd>
                      <PriceTag amount={p.gross} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-ink/50">
                      {t("payoutsPage.net")}
                    </dt>
                    <dd>
                      <PriceTag amount={p.net} className="font-semibold" />
                    </dd>
                  </div>
                </dl>

                {/* Desglose auditable: cada deducción rastrea a la orden
                    que la originó - acá se resume por concepto. */}
                {p.lines.length > 0 && (
                  <dl className="flex flex-col gap-1 border-t border-line pt-3">
                    <dt className="text-xs uppercase tracking-wide text-ink/50">
                      {t("payoutsPage.deductions")}
                    </dt>
                    {groupLines(p.lines).map(([type, total, count]) => (
                      <div
                        key={type}
                        className="flex items-center justify-between text-sm"
                      >
                        <dd className="text-ink/60">
                          {t.has(`payoutsPage.lineTypes.${type}`)
                            ? t(`payoutsPage.lineTypes.${type}`)
                            : type}
                          {count > 1 && (
                            <span className="text-ink/40"> ×{count}</span>
                          )}
                        </dd>
                        <dd>
                          <PriceTag amount={-total} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/50">
                  {p.paidAt && (
                    <span>
                      {t("payoutsPage.paidAt")}:{" "}
                      <EventDate start={p.paidAt} />
                    </span>
                  )}
                  {p.evidenceUrl && (
                    <a
                      href={p.evidenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-neon underline-offset-2 hover:underline"
                    >
                      {t("payoutsPage.evidence")}
                      <ArrowUpRightIcon className="h-3.5 w-3.5" />
                      <span className="sr-only"> {tc("newTab")}</span>
                    </a>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {gate === "ready" && <BillingDocsSection />}
    </main>
  );
}

// ── Notas de cobro (spec admin-billing-documents) ─────────────────────
// Documentos internos ISSUED que la plataforma emitió al actor por las
// deducciones de sus liquidaciones (GET /me/billing). El PDF abre inline
// en otra pestaña (auth por cookie). Vacío → no renderiza la sección.

type MyBillingDoc = {
  id: string;
  folio: number;
  periodStart: string;
  periodEnd: string;
  totalClp: number;
  issuedAt: string;
};

function BillingDocsSection() {
  const t = useTranslations("producer");
  const [docs, setDocs] = useState<MyBillingDoc[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/me/billing")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        setDocs((await res.json()) as MyBillingDoc[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (docs === null || docs.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink/80">
        {t("billingDocs.title")}
      </h2>
      <p className="text-xs text-ink/50">{t("billingDocs.desc")}</p>
      <ul className="flex flex-col gap-2 lg:grid lg:grid-cols-2">
        {docs.map((d) => (
          <li key={d.id}>
            <Card className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("billingDocs.folio", { n: d.folio })}
                </p>
                <p className="text-xs text-ink/50">
                  <EventDate start={d.periodStart} variant="compact" />
                  {" – "}
                  <EventDate start={d.periodEnd} variant="compact" /> ·{" "}
                  <PriceTag amount={d.totalClp} />
                </p>
              </div>
              <a
                href={`/api/me/billing/${d.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-sm text-neon underline-offset-2 hover:underline"
              >
                {t("billingDocs.openPdf")}
                <ArrowUpRightIcon className="h-3.5 w-3.5" />
              </a>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
