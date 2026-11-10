"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  RefreshIcon,
  SkeletonList,
  Spinner,
} from "@/components/ui";
import { inputCls, readError } from "@/components/academy/shared";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";

/**
 * Piezas compartidas del alta/edición de pasarela BYO (change
 * gateway-in-methods-form): el mismo contrato `GET|PUT|DELETE
 * .../gateway-account` sirve a academia (`/academies/:id/…`) y a
 * productor (`/producer/gateway-account`); solo cambian endpoint y
 * namespace i18n (`academyPay.gateway` / `producer.gateway` - mismas
 * keys, copy distinto por actor).
 *
 * - `GatewayCredentialsForm`: provider + credenciales (apiKey; secret
 *   solo FLOW/FINTOC) + PUT. La usa el alta en /nuevo y la rotación en
 *   la ficha /pasarela.
 * - `GatewayAccountPanel`: ficha completa (vista segura mask +
 *   webhookUrl, rotación y desactivar en zona roja con ConfirmSheet).
 *   Las credenciales viajan una sola vez por TLS: ninguna respuesta
 *   devuelve material plano.
 */
export type GatewayProvider = "FLOW" | "MERCADOPAGO" | "FINTOC";

export const GATEWAY_PROVIDERS: GatewayProvider[] = [
  "FLOW",
  "MERCADOPAGO",
  "FINTOC",
];

/** La segunda credencial del proveedor (FLOW: secret · FINTOC: whsec). */
export const GATEWAY_NEEDS_SECRET: ReadonlySet<GatewayProvider> = new Set([
  "FLOW",
  "FINTOC",
]);

/** Vista segura de la cuenta (spec producer-gateway-accounts /
 *  academy-byo-collections): nunca material plano, solo mask. */
export type GatewayAccountView = {
  id: string;
  provider: string;
  keyMask: string;
  status: string;
  webhookUrl: string;
  lastError: string | null;
  verifiedAt: string | null;
};

type GatewayNs = "academyPay.gateway" | "producer.gateway";

/** Badge de estado de la cuenta (ACTIVE neon; resto muted). */
export function GatewayStatusBadge({
  status,
  ns,
}: {
  status: string;
  ns: GatewayNs;
}) {
  const t = useTranslations(ns);
  return (
    <Badge variant={status === "ACTIVE" ? "neon" : "muted"}>
      {status === "ACTIVE" ? t("active") : t("inactive")}
    </Badge>
  );
}

/**
 * Form de credenciales de la pasarela: provider + apiKey + secret
 * condicional → `PUT <endpoint>`; `onSaved` recibe la vista segura
 * (el padre decide notice/navegación), `onFailed` el texto de error.
 */
export function GatewayCredentialsForm({
  endpoint,
  ns,
  existing,
  onSaved,
  onFailed,
}: {
  endpoint: string;
  ns: GatewayNs;
  /** Cuenta ya configurada: placeholder de reemplazo y CTA "rotar". */
  existing: GatewayAccountView | null;
  onSaved: (account: GatewayAccountView) => void;
  onFailed: (text: string) => void;
}) {
  const t = useTranslations(ns);
  const tc = useTranslations("common");
  const uid = useId();

  const [provider, setProvider] = useState<GatewayProvider>(
    existing?.provider &&
      GATEWAY_PROVIDERS.includes(existing.provider as GatewayProvider)
      ? (existing.provider as GatewayProvider)
      : "FLOW",
  );
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiFetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          ...(GATEWAY_NEEDS_SECRET.has(provider) && secret.trim()
            ? { secret: secret.trim() }
            : {}),
        }),
      });
      if (!res.ok) {
        onFailed((await readError(res)) ?? tc("error"));
        return;
      }
      const body = (await res.json()) as { account: GatewayAccountView };
      setApiKey("");
      setSecret("");
      onSaved(body.account);
    } catch {
      onFailed(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/60">{t("provider")}</span>
        <select
          id={`${uid}-provider`}
          value={provider}
          onChange={(e) => setProvider(e.target.value as GatewayProvider)}
          className={inputCls}
        >
          {GATEWAY_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink/60">
          {provider === "MERCADOPAGO"
            ? t("accessToken")
            : provider === "FINTOC"
              ? t("secretKey")
              : t("apiKey")}
        </span>
        <input
          id={`${uid}-key`}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={existing ? t("replacePlaceholder") : "••••"}
          className={inputCls}
        />
      </label>
      {GATEWAY_NEEDS_SECRET.has(provider) && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink/60">
            {provider === "FINTOC" ? t("webhookSecret") : t("secretKey")}
          </span>
          <input
            id={`${uid}-secret`}
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={inputCls}
          />
        </label>
      )}
      <p className="text-xs text-ink/50">{t("hint")}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={
            busy ||
            !apiKey.trim() ||
            (GATEWAY_NEEDS_SECRET.has(provider) && !secret.trim())
          }
        >
          {busy ? <Spinner size="sm" /> : null}
          {existing ? t("rotate") : t("save")}
        </Button>
      </div>
    </form>
  );
}

/** Vista segura de la cuenta: provider+status, mask, webhookUrl y
 *  último error (misma composición que la ex sección aparte). */
function GatewayAccountSummary({
  account,
  ns,
}: {
  account: GatewayAccountView;
  ns: GatewayNs;
}) {
  const t = useTranslations(ns);
  return (
    <Card padded={false}>
      <ul className="flex flex-col divide-y divide-line">
        <li className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm text-ink/70">{t("provider")}</span>
          <span className="flex items-center gap-2">
            <span className="text-base font-medium">{account.provider}</span>
            <GatewayStatusBadge status={account.status} ns={ns} />
          </span>
        </li>
        <li className="flex items-center justify-between gap-3 px-5 py-4">
          <span className="text-sm text-ink/70">{t("credential")}</span>
          <span className="text-base tabular-nums">{account.keyMask}</span>
        </li>
        <li className="flex flex-col gap-2 px-5 py-4">
          <span className="text-sm text-ink/70">{t("webhookLabel")}</span>
          <code className="break-all rounded-lg bg-elevated px-3 py-2 text-xs text-ink/80">
            {account.webhookUrl}
          </code>
        </li>
        {account.lastError && (
          <li className="flex flex-col gap-1 px-5 py-4">
            <span className="text-sm text-live">{t("lastError")}</span>
            <span className="break-all text-xs text-ink/60">
              {account.lastError}
            </span>
          </li>
        )}
      </ul>
    </Card>
  );
}

/**
 * Ficha de la cuenta de pasarela (nivel 2, patrón consola): vista
 * segura + rotación de credenciales (mismo PUT del alta) + desactivar
 * en zona roja con ConfirmSheet. Sin cuenta configurada muestra el
 * empty state con CTA al alta unificada (/nuevo).
 */
export function GatewayAccountPanel({
  endpoint,
  ns,
  createHref,
  createLabel,
}: {
  endpoint: string;
  ns: GatewayNs;
  /** CTA del empty state: ruta del alta unificada de métodos. */
  createHref: string;
  createLabel: string;
}) {
  const t = useTranslations(ns);
  const tc = useTranslations("common");

  const [account, setAccount] = useState<GatewayAccountView | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint);
      if (!res.ok) {
        setState("error");
        return;
      }
      const body = (await res.json()) as {
        account: GatewayAccountView | null;
      };
      setAccount(body.account);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  async function disable() {
    setDisabling(true);
    setNotice(null);
    try {
      const res = await apiFetch(endpoint, { method: "DELETE" });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      const body = (await res.json()) as {
        account: GatewayAccountView | null;
      };
      setAccount(body.account);
      setConfirmOff(false);
      setNotice({ text: t("disabled") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setDisabling(false);
    }
  }

  if (state === "loading") {
    return <SkeletonList items={2} />;
  }
  if (state === "error") {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {tc("error")}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setState("loading");
            setNonce((n) => n + 1);
          }}
        >
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }
  if (!account) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink/60">{t("empty")}</p>
        <Button variant="secondary" size="sm" href={createHref}>
          + {createLabel}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <Badge variant="outline">{account.provider}</Badge>
          <GatewayStatusBadge status={account.status} ns={ns} />
        </div>
        <GatewayAccountSummary account={account} ns={ns} />
        <Card className="p-4">
          <GatewayCredentialsForm
            endpoint={endpoint}
            ns={ns}
            existing={account}
            onSaved={(next) => {
              setAccount(next);
              setNotice({ text: t("saved") });
            }}
            onFailed={(text) => setNotice({ text, error: true })}
          />
        </Card>
      </section>

      {/* Zona destructiva al pie (console-patterns §4): desactivar no
          borra la cuenta - la pasa a DISABLED y el cobro online queda
          según el fallback del actor. */}
      {account.status === "ACTIVE" && (
        <div className="flex justify-center border-t border-line pt-6">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabling}
            onClick={() => setConfirmOff(true)}
            className="text-red-400 hover:text-red-300"
          >
            {t("disable")}
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={confirmOff}
        title={t("confirmOffTitle")}
        description={t("confirmOff")}
        confirmLabel={t("confirmYes")}
        busy={disabling}
        onConfirm={() => void disable()}
        onClose={() => setConfirmOff(false)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </div>
  );
}
