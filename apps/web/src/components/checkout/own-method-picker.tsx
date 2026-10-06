"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export type OwnMethod = {
  id: string;
  type: "TRANSFER" | "PAYMENT_LINK" | "CASH" | string;
  label: string;
  details: Record<string, string>;
};

const TRANSFER_FIELD_KEYS = {
  bank: "fBank",
  accountType: "fAccountType",
  accountNumber: "fAccountNumber",
  holder: "fHolder",
  rut: "fRut",
  email: "fEmail",
} as const;
const TRANSFER_FIELDS = Object.keys(
  TRANSFER_FIELD_KEYS,
) as (keyof typeof TRANSFER_FIELD_KEYS)[];

/** Detalle de un método (datos bancarios / link / instrucciones). Lo
 *  comparten el picker del checkout y la vista post-orden del claim. */
export function OwnMethodDetails({ method }: { method: OwnMethod }) {
  const t = useTranslations("checkout");
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(key: string, text: string) {
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mt-2">
      {method.type === "TRANSFER" && (
        <dl className="flex flex-col gap-1.5 text-sm">
          {TRANSFER_FIELDS.map((f) =>
            method.details[f] ? (
              <div key={f} className="flex items-center gap-2">
                <dt className="w-28 shrink-0 text-white/50">
                  {t(TRANSFER_FIELD_KEYS[f])}
                </dt>
                <dd className="font-mono text-white/90">
                  {method.details[f]}
                </dd>
                <button
                  type="button"
                  onClick={() => void copy(f, method.details[f])}
                  className="ml-auto min-h-8 rounded-lg px-2 text-xs text-neon hover:bg-neon/10"
                >
                  {copied === f ? t("copied") : t("copy")}
                </button>
              </div>
            ) : null,
          )}
        </dl>
      )}
      {method.type === "PAYMENT_LINK" && method.details.url && (
        <a
          href={method.details.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl bg-neon px-4 text-sm font-semibold text-night-950"
        >
          {t("payLink")}
        </a>
      )}
      {method.type === "CASH" && method.details.instructions && (
        <p className="text-sm text-white/70">{method.details.instructions}</p>
      )}
      {method.details.instructions && method.type !== "CASH" && (
        <p className="mt-1 text-sm text-white/70">
          {method.details.instructions}
        </p>
      )}
    </div>
  );
}

/**
 * Selector "cómo pagar" del checkout (spec producer-own-methods):
 * pasarela (tarjeta/webpay) vs métodos propios del productor
 * (transferencia/link/efectivo). Solo se renderiza si hay métodos
 * activos - sin métodos el checkout queda igual que antes.
 */
export function OwnMethodPicker({
  methods,
  value,
  onChange,
  disabled,
}: {
  methods: OwnMethod[];
  value: string | null;
  onChange: (methodId: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("checkout");
  const selected = methods.find((m) => m.id === value) ?? null;

  if (methods.length === 0) return null;

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-2">
      <legend className="text-sm font-semibold">
        {t("ownMethodTitle")}
      </legend>
      <div role="radiogroup" className="flex flex-col gap-2">
        <label
          className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors ${
            value === null
              ? "border-neon/60 bg-neon/10"
              : "border-night-700 hover:border-night-600"
          }`}
        >
          <input
            type="radio"
            name="own-method"
            checked={value === null}
            onChange={() => onChange(null)}
            className="accent-neon"
          />
          <span className="text-sm font-medium">{t("ownMethodGateway")}</span>
        </label>
        {methods.map((m) => (
          <label
            key={m.id}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-4 transition-colors ${
              value === m.id
                ? "border-neon/60 bg-neon/10"
                : "border-night-700 hover:border-night-600"
            }`}
          >
            <input
              type="radio"
              name="own-method"
              checked={value === m.id}
              onChange={() => onChange(m.id)}
              className="accent-neon"
            />
            <span className="text-sm font-medium">{m.label}</span>
          </label>
        ))}
      </div>
      {selected && (
        <div className="rounded-xl border border-night-700 bg-night-800 p-4">
          <OwnMethodDetails method={selected} />
          <p className="mt-3 text-xs text-white/50">{t("ownMethodHint")}</p>
        </div>
      )}
    </fieldset>
  );
}
