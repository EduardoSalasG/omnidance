"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate, PriceTag } from "@/components/ui";
import {
  PAYOUT_STATUS_VARIANT,
  PRODUCER_ROLES,
  type Payout,
} from "@/components/producer/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

/**
 * /productor/pagos — liquidaciones del productor (GET /me/payouts,
 * requiere permiso crm.manage del rol PRODUCER).
 */
export default function ProducerPayoutsPage() {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [listError, setListError] = useState(false);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) {
        setGate("unauth");
        return;
      }
      if (!me.ok) {
        setGate("error");
        return;
      }
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.some((r) => PRODUCER_ROLES.has(r))) {
        setGate("notProducer");
        return;
      }

      const res = await apiFetch("/me/payouts");
      if (!res.ok) {
        setListError(true);
      } else {
        setPayouts((await res.json()) as Payout[]);
      }
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-6">
      <Link
        href="/productor"
        className="inline-flex min-h-11 w-fit items-center text-sm text-white/60 hover:text-white"
      >
        ← {t("title")}
      </Link>

      <h1 className="text-2xl font-bold">{t("payoutsPage.title")}</h1>

      {gate === "loading" && (
        <p role="status" className="text-white/60">
          {tc("loading")}
        </p>
      )}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notProducer")}</p>
          <Button href="/" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-white/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && listError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && !listError && payouts.length === 0 && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p role="status" className="text-white/70">
            {t("payoutsPage.empty")}
          </p>
        </Card>
      )}

      {gate === "ready" && !listError && payouts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {payouts.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-white/50">
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
                    <dt className="text-xs text-white/50">
                      {t("payoutsPage.gross")}
                    </dt>
                    <dd>
                      <PriceTag amount={p.gross} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-white/50">
                      {t("payoutsPage.net")}
                    </dt>
                    <dd>
                      <PriceTag amount={p.net} />
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
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
                      className="text-neon underline-offset-2 hover:underline"
                    >
                      {t("payoutsPage.evidence")} ↗
                      <span className="sr-only"> {tc("newTab")}</span>
                    </a>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
