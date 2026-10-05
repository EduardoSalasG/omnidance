"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, Spinner } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { PaymentCards } from "@/components/payments/payment-cards";
import type { PaymentAuditRow } from "@/components/payments/shared";

type Gate = "loading" | "unauth" | "error" | "ready";

const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

// GET /subscriptions/mine - contexto de cobros recurrentes (plan + academia
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
 * /perfil/pagos - "Mis pagos" del bailarín: historial de órdenes
 * (GET /payments/mine) con fee/neto/fecha real de cobro y ledger
 * expandible por pago; arriba, las suscripciones vigentes como contexto.
 */
export default function PerfilPagosPage() {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const ts = useTranslations("subscriptions");

  const [gate, setGate] = useState<Gate>("loading");
  const [payments, setPayments] = useState<PaymentAuditRow[]>([]);
  const [subs, setSubs] = useState<MySubscription[]>([]);
  // Cancelación inline por suscripción (2-step igual que en la ficha).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Refresh de solo las suscripciones (post-cancel) - no toca el gate
  // para que la página no vuelva a skeleton parpadeando.
  const refreshSubs = useCallback(async () => {
    const res = await apiFetch("/subscriptions/mine").catch(() => null);
    if (res?.ok) {
      const list = (await res.json()) as MySubscription[];
      setSubs(list.filter((s) => s.status !== "CANCELED"));
    }
  }, []);

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

  /**
   * POST /subscriptions/:id/cancel - at_period_end: la sub queda
   * CANCEL_PENDING y conserva acceso hasta el fin del período pagado;
   * el refresh re-lee el estado real del server.
   */
  async function cancelSub(id: string) {
    if (cancelBusyId) return;
    setCancelBusyId(id);
    setCancelError(null);
    try {
      const res = await apiFetch(`/subscriptions/${id}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        setCancelError(tc("error"));
        return;
      }
      setConfirmId(null);
      await refreshSubs();
    } catch {
      setCancelError(tc("error"));
    } finally {
      setCancelBusyId(null);
    }
  }

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
              <RefreshIcon /> {tc("retry")}
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

      {/* Suscripciones vivas - contexto de los cobros MEMBERSHIP de abajo. */}
      {subs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("sub.title")}
          </h2>
          <ul className="flex flex-col gap-3">
            {subs.map((s) => (
              <li key={s.id}>
                {/* La card no puede ser <Link> completa: contiene el
                    botón de cancelar (nested interactive sería inválido).
                    El nombre linkea a la ficha, donde vive la gestión
                    completa (retomar tarjeta, ver plan). */}
                <Card className="flex flex-col gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/academias/${s.academy.id}`}
                      className="min-w-0 flex-1 truncate rounded text-sm font-semibold hover:text-neon focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                    >
                      {s.academy.name} · {s.plan.name}
                    </Link>
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

                  {/* Cancelación directa - mismo 2-step + endpoint que la
                      ficha de la academia (at_period_end: se conserva el
                      acceso hasta el fin del período ya pagado). */}
                  {s.status === "ACTIVE" &&
                    (confirmId === s.id ? (
                      <div className="mt-1 flex flex-col gap-2">
                        <p className="text-xs text-white/60">
                          {ts("cancelConfirm")}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            disabled={cancelBusyId === s.id}
                            onClick={() => void cancelSub(s.id)}
                          >
                            {cancelBusyId === s.id && (
                              <Spinner size="sm" />
                            )}
                            {ts("cancelYes")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="flex-1"
                            disabled={cancelBusyId === s.id}
                            onClick={() => setConfirmId(null)}
                          >
                            {ts("cancelKeep")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() => {
                          setConfirmId(s.id);
                          setCancelError(null);
                        }}
                      >
                        {ts("cancel")}
                      </Button>
                    ))}
                  {s.status === "CANCEL_PENDING" && (
                    <p className="text-xs text-white/50">
                      {s.nextInvoiceAt
                        ? ts("cancelPending", {
                            date: dateFmt.format(new Date(s.nextInvoiceAt)),
                          })
                        : ts("cancelPendingNoDate")}
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
          {cancelError && (
            <p role="alert" className="text-sm text-red-400">
              {cancelError}
            </p>
          )}
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
