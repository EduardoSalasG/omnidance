"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";
import { GatewayCredentialsForm } from "@/components/payments/gateway-account";

type MethodType = "TRANSFER" | "PAYMENT_LINK" | "CASH";

const TYPE_KEYS = {
  TRANSFER: "typeTransfer",
  PAYMENT_LINK: "typeLink",
  CASH: "typeCash",
} as const;

// Tipo de cuenta bancaria chilena: select cerrado en el form de
// transferencia (mismo set que payment-methods-admin de academia).
const ACCOUNT_TYPE_OPTIONS = ["Vista", "Corriente", "Ahorro"] as const;

const TRANSFER_DETAIL_KEYS = [
  ["bank", "fBank"],
  ["accountType", "fAccountType"],
  ["accountNumber", "fAccountNumber"],
  ["holder", "fHolder"],
  ["rut", "fRut"],
  ["email", "fEmail"],
] as const;

/**
 * /productor/medios-pago/nuevo - alta unificada (change
 * gateway-in-methods-form): el productor elige el tipo (método manual
 * transferencia/link/efectivo → POST /producer/payment-methods, o
 * pasarela propia FLOW/MERCADOPAGO/FINTOC → PUT
 * /producer/gateway-account). La edición/desactivar de la pasarela
 * vive en la ficha /medios-pago/pasarela.
 */
export default function ProducerMedioPagoNuevoPage() {
  const tpr = useTranslations("producer");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/productor/medios-pago"
        backLabel={tpr("ownMethods.title")}
      />
      <ProducerGate>
        {isProducer ? (
          <MethodCreate />
        ) : (
          <p className="text-sm text-ink/60">
            {tpr("configPages.producerOnly")}
          </p>
        )}
      </ProducerGate>
    </main>
  );
}

function MethodCreate() {
  const t = useTranslations("academyPay");
  const tp = useTranslations("producer.ownMethods");
  const tg = useTranslations("producer.gateway");
  const tc = useTranslations("common");
  const router = useRouter();

  const [kind, setKind] = useState<"manual" | "gateway">("manual");
  const [type, setType] = useState<MethodType>("TRANSFER");
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [order, setOrder] = useState("0");
  const [busy, setBusy] = useState(false);

  function setDetail(k: string, v: string) {
    setDetails((d) => ({ ...d, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch("/producer/payment-methods", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          label: label.trim(),
          details: Object.fromEntries(
            Object.entries(details).filter(([, v]) => v.trim()),
          ),
          order: Number(order) || 0,
        }),
      });
      if (!res.ok) {
        showActionNotice({ text: t("error"), error: true });
        return;
      }
      // Aviso global + vuelta inmediata al listado (patrón de la consola).
      showActionNotice({ text: tp("created") });
      router.push("/productor/medios-pago");
    } catch {
      showActionNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  function onGatewaySaved() {
    showActionNotice({ text: tp("created") });
    router.push("/productor/medios-pago");
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("addMethod")}
      </h2>
      {/* Tipo de alta al inicio (spec payments/gateways): manual =
          form de medio directo intacto; pasarela = credenciales BYO
          del provider (PUT gateway-account). */}
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-ink/60">{t("kindLabel")}</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "manual" | "gateway")}
          className={inputCls}
        >
          <option value="manual">{t("kindManual")}</option>
          <option value="gateway">{tg("title")}</option>
        </select>
      </label>
      {kind === "gateway" ? (
        <div className="mt-3">
          <GatewayCredentialsForm
            endpoint="/producer/gateway-account"
            ns="producer.gateway"
            existing={null}
            onSaved={onGatewaySaved}
            onFailed={(text) => showActionNotice({ text, error: true })}
          />
        </div>
      ) : (
        <form onSubmit={create} className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("fType")}</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as MethodType);
                setDetails({});
              }}
              className={inputCls}
            >
              {(Object.keys(TYPE_KEYS) as (keyof typeof TYPE_KEYS)[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {t(TYPE_KEYS[k])}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("fLabel")}</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("fLabelPh")}
              maxLength={60}
              required
              className={inputCls}
            />
          </label>
          {type === "TRANSFER" &&
            TRANSFER_DETAIL_KEYS.map(([key, i18n]) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="text-ink/60">{t(i18n)}</span>
                {key === "accountType" ? (
                  <select
                    value={details[key] ?? ""}
                    onChange={(e) => setDetail(key, e.target.value)}
                    className={inputCls}
                  >
                    <option value=""></option>
                    {ACCOUNT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={details[key] ?? ""}
                    onChange={(e) => setDetail(key, e.target.value)}
                    className={inputCls}
                  />
                )}
              </label>
            ))}
          {type === "PAYMENT_LINK" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">{t("fUrl")}</span>
              <input
                type="url"
                value={details.url ?? ""}
                onChange={(e) => setDetail("url", e.target.value)}
                placeholder="https://mpago.la/…"
                className={inputCls}
              />
            </label>
          )}
          {type === "CASH" && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink/60">{t("fInstructions")}</span>
              <input
                value={details.instructions ?? ""}
                onChange={(e) => setDetail("instructions", e.target.value)}
                placeholder={t("fInstructionsPh")}
                className={inputCls}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("fOrder")}</span>
            <input
              type="number"
              inputMode="numeric"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className={`${inputCls} w-24`}
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!label.trim() || busy}
            >
              {busy ? <Spinner size="sm" /> : null}
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              href="/productor/medios-pago"
            >
              {tc("cancel")}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
