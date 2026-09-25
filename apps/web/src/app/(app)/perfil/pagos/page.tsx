"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { PaymentCards } from "@/components/payments/payment-cards";
import type { PaymentAuditRow } from "@/components/payments/shared";

type Gate = "loading" | "unauth" | "error" | "ready";

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// GET /subscriptions/mine — contexto de cobros recurrentes (plan + academia
// resueltos por la API vía plan.academy).
type MySubscription = {
  id: string;
  status: string;
  nextInvoiceAt: string | null;
  canceledAt: string | null;
  plan: { id: string; name: string; type: string; price: number };
  academy: { id: string; name: string };
};

/**
 * /perfil/pagos — "Mis pagos" del bailarín: historial de órdenes
 * (GET /payments/mine) con fee/neto/fecha real de cobro y ledger
 * expandible por pago; arriba, las suscripciones vigentes como contexto.
 */
export default function PerfilPagosPage() {
  const t = useTranslations("payments");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [payments, setPayments] = useState<PaymentAuditRow[]>([]);
  const [subs, setSubs] = useState<MySubscription[]>([]);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const [payRes, subRes] = await Promise.all([
        apiFetch("/payments/mine"),
        // Contexto opcional: si falla la lista de pagos igual se muestra.
        apiFetch("/subscriptions/mine").catch(() => null),
      ]);
      if (payRes.status === 401) {
        setGate("unauth");
        return;
      }
      if (!payRes.ok) {
        setGate("error");
        return;
      }
      setPayments((await payRes.json()) as PaymentAuditRow[]);
      if (subRes?.ok) {
        const list = (await subRes.json()) as MySubscription[];
        setSubs(list.filter((s) => s.status !== "CANCELED"));
      }
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (gate === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  if (gate === "loading" || gate === "error") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6">
        {gate === "error" ? (
          <>
            <p role="alert" className="text-white/50">
              {tc("error")}
            </p>
            <Button variant="secondary" onClick={() => void boot()}>
              ↻ {tc("retry")}
            </Button>
          </>
        ) : (
          <SkeletonList />
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-white/50">{t("subtitle")}</p>
      </div>

      {/* Suscripciones vivas — contexto de los cobros MEMBERSHIP de abajo. */}
      {subs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("sub.title")}
          </h2>
          <ul className="flex flex-col gap-3">
            {subs.map((s) => (
              <li key={s.id}>
                {/* La ficha de la academia es donde vive la gestión
                    (cancelar / registrar tarjeta) — la card linkea ahí. */}
                <Link href={`/academias/${s.academy.id}`} className="block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon">
                  <Card className="flex flex-col gap-1.5 p-4 transition-colors hover:border-neon/40">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {s.academy.name} · {s.plan.name}
                      </p>
                      <Badge
                        variant={s.status === "ACTIVE" ? "neon" : "outline"}
                      >
                        {t.has(`sub.status.${s.status}`)
                          ? t(`sub.status.${s.status}`)
                          : s.status}
                      </Badge>
                    </div>
                    {s.nextInvoiceAt && s.status === "ACTIVE" && (
                      <p className="text-xs text-white/50">
                        {t("sub.nextCharge", {
                          date: dateFmt.format(new Date(s.nextInvoiceAt)),
                        })}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {payments.length === 0 ? (
        <Card className="py-8 text-center">
          <p role="status" className="text-sm text-white/70">
            {t("empty")}
          </p>
        </Card>
      ) : (
        <PaymentCards payments={payments} withLedger />
      )}
    </main>
  );
}
