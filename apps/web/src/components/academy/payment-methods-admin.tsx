"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import Link from "next/link";
import { Badge, Button, Card, Spinner } from "@/components/ui";

export type Method = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH";
  label: string;
  details: Record<string, string>;
  order: number;
  active: boolean;
};

export const TYPE_KEYS = {
  TRANSFER: "typeTransfer",
  PAYMENT_LINK: "typeLink",
  CASH: "typeCash",
} as const;

export const TRANSFER_DETAIL_KEYS = [
  ["bank", "fBank"],
  ["accountType", "fAccountType"],
  ["accountNumber", "fAccountNumber"],
  ["holder", "fHolder"],
  ["rut", "fRut"],
  ["email", "fEmail"],
] as const;

type Props = { academyId: string };

/**
 * CRUD de medios de pago BYO del owner (spec academy-payment-claims):
 * publica cómo le pagan (transferencia, link de pago, efectivo) - los
 * métodos activos se muestran al alumno en la ficha de la academia.
 */
export function PaymentMethodsAdmin({ academyId }: Props) {
  const t = useTranslations("academyPay");
  const tc = useTranslations("common");

  const [methods, setMethods] = useState<Method[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<Method["type"]>("TRANSFER");
  const [label, setLabel] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [order, setOrder] = useState("0");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(
      `/academies/${academyId}/payment-methods/admin`,
    ).catch(() => null);
    setMethods(res?.ok ? await res.json() : []);
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function setDetail(k: string, v: string) {
    setDetails((d) => ({ ...d, [k]: v }));
  }

  async function create() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/payment-methods`, {
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
        setMsg(t("error"));
        return;
      }
      setShowForm(false);
      setLabel("");
      setDetails({});
      setOrder("0");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "min-h-11 rounded-xl border border-line bg-surface px-3 text-sm";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
            {t("methodsAdminTitle")}
          </h2>
          <p className="mt-1 text-xs text-ink/50">
            {t("methodsAdminDesc")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowForm((v) => !v)}
        >
          {t("addMethod")}
        </Button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-elevated p-4 lg:max-w-xl">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink/60">{t("fType")}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as Method["type"])}
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
              className={inputCls}
            />
          </label>
          {type === "TRANSFER" &&
            TRANSFER_DETAIL_KEYS.map(([key, i18n]) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span className="text-ink/60">{t(i18n)}</span>
                <input
                  value={details[key] ?? ""}
                  onChange={(e) => setDetail(key, e.target.value)}
                  className={inputCls}
                />
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
          {msg && (
            <p role="alert" className="text-sm text-red-400">
              {msg}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => void create()}
              disabled={!label.trim() || busy}
            >
              {busy ? <Spinner size="sm" /> : null}
              {t("save")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      )}

      {methods === null ? (
        <Spinner />
      ) : methods.length === 0 ? (
        <p className="text-sm text-ink/50">{t("methodsEmpty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {methods.map((m) => (
            <li key={m.id}>
              <Link
                href={`/academia/configuracion/pagos/${m.id}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm transition-colors hover:border-neon/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
              >
                {/* Card completo clickeable → detalle/edición del medio
                    (activar/desactivar y eliminar viven en la ficha). */}
                <span className="font-medium">{m.label}</span>
                <Badge variant="outline">{t(TYPE_KEYS[m.type])}</Badge>
                {!m.active && <Badge variant="muted">{t("inactive")}</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
