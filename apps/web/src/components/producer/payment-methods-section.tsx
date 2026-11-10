"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ChevronRightIcon,
  ConfirmSheet,
  SkeletonList,
} from "@/components/ui";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";
import { Link } from "@/i18n/navigation";
import type { GatewayAccountView } from "@/components/payments/gateway-account";

type Method = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH";
  label: string;
  details: Record<string, string>;
  order: number;
  active: boolean;
};

const TYPE_KEYS = {
  TRANSFER: "typeTransfer",
  PAYMENT_LINK: "typeLink",
  CASH: "typeCash",
} as const;

/**
 * "Medios de cobro" del productor (spec producer-own-methods):
 * transferencia/link/efectivo que se ofrecen en el checkout de sus
 * eventos como alternativa a la pasarela. CRUD propio bajo
 * /producer/payment-methods (gate de productor APPROVED en el API).
 * Lista unificada (change gateway-in-methods-form): la cuenta de
 * pasarela propia entra como primera fila (badge + mask + webhookUrl)
 * y navega a la ficha /medios-pago/pasarela; el alta de ambos tipos
 * vive en /medios-pago/nuevo detrás del CTA (console-patterns §1 -
 * nunca form inline en el listado).
 */
export function ProducerPaymentMethodsSection() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer.ownMethods");

  const [methods, setMethods] = useState<Method[] | null>(null);
  const [gateway, setGateway] = useState<GatewayAccountView | null>(null);
  const [busy, setBusy] = useState(false);
  // Feedback de la sección (éxito y error): vive fuera de la lista para
  // que siga visible tras mutaciones.
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  // Confirmación destructiva compartida (reemplaza window.confirm).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    // El fetch de la pasarela va en paralelo y no bloquea el listado:
    // si falla el card no se pinta y el retry re-dispara ambos.
    const [methodsRes, gatewayRes] = await Promise.all([
      apiFetch("/producer/payment-methods").catch(() => null),
      apiFetch("/producer/gateway-account").catch(() => null),
    ]);
    setMethods(methodsRes?.ok ? await methodsRes.json() : []);
    if (gatewayRes?.ok) {
      const body = (await gatewayRes.json()) as {
        account: GatewayAccountView | null;
      };
      setGateway(body.account);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/producer/payment-methods/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        setNotice({ text: t("error"), error: true });
        return;
      }
      setNotice({ text: tp("updated") });
      await load();
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setPendingDelete(null);
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/producer/payment-methods/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({ text: t("error"), error: true });
        return;
      }
      setNotice({ text: tp("removed") });
      await load();
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {tp("title")}
          </h2>
          <p className="mt-1 text-xs text-ink/50">{tp("desc")}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          href="/productor/medios-pago/nuevo"
        >
          {t("addMethod")}
        </Button>
      </div>

      {methods === null ? (
        <SkeletonList items={2} />
      ) : methods.length === 0 && !gateway ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-ink/50">{t("methodsEmpty")}</p>
          <Button
            variant="secondary"
            size="sm"
            href="/productor/medios-pago/nuevo"
          >
            + {t("addMethod")}
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {gateway && (
            <li>
              {/* Cuenta de pasarela en la misma colección (spec
                  payments/gateways): badge de tipo, mask, status y la
                  webhookUrl a pegar en el panel del provider. */}
              <Link
                href="/productor/medios-pago/pasarela"
                className="flex min-h-11 flex-col gap-1 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-neon/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                <span className="flex min-h-6 flex-wrap items-center gap-2">
                  <span className="font-medium">{gateway.provider}</span>
                  <Badge variant="outline">{t("fieldGateway")}</Badge>
                  <Badge
                    variant={
                      gateway.status === "ACTIVE" ? "neon" : "muted"
                    }
                  >
                    {gateway.status === "ACTIVE"
                      ? t("gateway.active")
                      : t("gateway.inactive")}
                  </Badge>
                  <ChevronRightIcon className="ml-auto h-4 w-4 shrink-0 text-ink/40" />
                </span>
                <span className="text-xs tabular-nums text-ink/50">
                  {gateway.keyMask}
                </span>
                <code className="break-all text-xs text-ink/40">
                  {gateway.webhookUrl}
                </code>
              </Link>
            </li>
          )}
          {methods.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
            >
              <span className="font-medium">{m.label}</span>
              <Badge variant="outline">{t(TYPE_KEYS[m.type])}</Badge>
              {!m.active && <Badge variant="muted">{t("inactive")}</Badge>}
              <span className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void patch(m.id, { active: !m.active })}
                >
                  {m.active ? t("deactivate") : t("activate")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPendingDelete(m.id)}
                >
                  {t("remove")}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmSheet
        open={pendingDelete !== null}
        title={t("deleteConfirm")}
        confirmLabel={t("remove")}
        busy={busy}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
        onClose={() => setPendingDelete(null)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </Card>
  );
}
