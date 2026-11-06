"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, Spinner } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { inputCls, type Academy } from "@/components/academy/shared";
import {
  TRANSFER_DETAIL_KEYS,
  ACCOUNT_TYPE_OPTIONS,
  TYPE_KEYS,
  type Method,
} from "@/components/academy/payment-methods-admin";
import { useRouter } from "@/i18n/navigation";

/**
 * /academia/configuracion/metodos-de-pago/nuevo - alta de un medio de pago BYO
 * (transferencia/link/efectivo). POST /academies/:id/payment-methods.
 * La edición vive en /configuracion/metodos-de-pago/[methodId].
 */
export default function PaymentMethodNewPage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/metodos-de-pago"
        backLabel={t("methodsAdminTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <MethodCreate key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}

function MethodCreate({ academy }: { academy: Academy }) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");
  const router = useRouter();

  const [type, setType] = useState<Method["type"]>("TRANSFER");
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function setDetail(k: string, v: string) {
    setDetails((d) => ({ ...d, [k]: v }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(
        `/academies/${academy.id}/payment-methods`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type,
            label: label.trim(),
            details: Object.fromEntries(
              Object.entries(details).filter(([, v]) => v.trim()),
            ),
          }),
        },
      );
      if (!res.ok) {
        showActionNotice({ text: t("error"), error: true });
        return;
      }
      // Aviso global + vuelta inmediata al listado (patrón de la consola).
      showActionNotice({ text: t("methodSaved") });
      router.push("/academia/configuracion/metodos-de-pago");
    } catch {
      showActionNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("addMethod")}
      </h2>
      <form onSubmit={create} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink/60">{t("fType")}</span>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as Method["type"]);
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
              className={inputCls}
            />
          </label>
        )}
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
            href="/academia/configuracion/metodos-de-pago"
          >
            {tc("cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
