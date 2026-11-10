"use client";

import { useCallback, useEffect, useState } from "react";
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
import { readError } from "@/components/academy/shared";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";

/** GET /academies/:id/gateway-account - vista segura (spec
 *  academy-byo-collections): nunca material plano, solo mask. */
type GatewayAccountView = {
  id: string;
  provider: string;
  keyMask: string;
  status: string;
  webhookUrl: string;
  lastError: string | null;
  verifiedAt: string | null;
};

type Provider = "FLOW" | "MERCADOPAGO" | "FINTOC";

const PROVIDERS: Provider[] = ["FLOW", "MERCADOPAGO", "FINTOC"];

/** La segunda credencial del proveedor (FLOW: secret · FINTOC: whsec). */
const NEEDS_SECRET = new Set<Provider>(["FLOW", "FINTOC"]);

/**
 * Sección "Pasarela de pagos" de /academia/configuracion/metodos-de-pago
 * (spec academy-byo-collections): la academia trae sus credenciales
 * Flow/MP y cobra directo a su cuenta - Omnidance nunca recibe la plata
 * y le factura el take mes vencido (/academia/cobros/liquidaciones).
 * Sin cuenta activa la venta online queda solo por comprobante (los
 * medios propios de abajo). Espejo de la sección del productor
 * (components/producer/gateway-account-section): mismos componentes,
 * mismo flujo, distinto endpoint y copy (desactivar no vuelve el cobro
 * a la plataforma - academias ya no venden por our-Flow).
 */
export function AcademyGatewaySection({ academyId }: { academyId: string }) {
  const t = useTranslations("academyPay.gateway");
  const tc = useTranslations("common");

  const [account, setAccount] = useState<GatewayAccountView | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">(
    "loading",
  );
  const [nonce, setNonce] = useState(0);

  const [provider, setProvider] = useState<Provider>("FLOW");
  const [apiKey, setApiKey] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"save" | "disable" | null>(null);
  const [notice, setNotice] = useState<ActionNoticeData | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/academies/${academyId}/gateway-account`);
      if (!res.ok) {
        setState("error");
        return;
      }
      const body = (await res.json()) as {
        account: GatewayAccountView | null;
      };
      setAccount(body.account);
      if (
        body.account?.provider &&
        PROVIDERS.includes(body.account.provider as Provider)
      ) {
        setProvider(body.account.provider as Provider);
      }
      setState("ready");
    } catch {
      setState("error");
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  async function save() {
    setBusy("save");
    setNotice(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/gateway-account`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim(),
          ...(NEEDS_SECRET.has(provider) && secret.trim()
            ? { secret: secret.trim() }
            : {}),
        }),
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? tc("error"), error: true });
        return;
      }
      const body = (await res.json()) as {
        account: GatewayAccountView;
      };
      setAccount(body.account);
      setApiKey("");
      setSecret("");
      setNotice({ text: t("saved") });
    } catch {
      setNotice({ text: tc("error"), error: true });
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    setNotice(null);
    try {
      const res = await apiFetch(`/academies/${academyId}/gateway-account`, {
        method: "DELETE",
      });
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
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("title")}
      </h2>

      {state === "loading" && <SkeletonList items={2} />}

      {state === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-ink/70">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setState("loading");
              setNonce((n) => n + 1);
            }}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && (
        <>
          {account ? (
            <Card padded={false}>
              <ul className="flex flex-col divide-y divide-line">
                <li className="flex items-center justify-between gap-3 px-5 py-4">
                  <span className="text-sm text-ink/70">
                    {t("provider")}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-base font-medium">
                      {account.provider}
                    </span>
                    <Badge
                      variant={
                        account.status === "ACTIVE" ? "neon" : "muted"
                      }
                    >
                      {account.status === "ACTIVE"
                        ? t("active")
                        : t("inactive")}
                    </Badge>
                  </span>
                </li>
                <li className="flex items-center justify-between gap-3 px-5 py-4">
                  <span className="text-sm text-ink/70">
                    {t("credential")}
                  </span>
                  <span className="text-base tabular-nums">
                    {account.keyMask}
                  </span>
                </li>
                <li className="flex flex-col gap-2 px-5 py-4">
                  <span className="text-sm text-ink/70">
                    {t("webhookLabel")}
                  </span>
                  <code className="break-all rounded-lg bg-elevated px-3 py-2 text-xs text-ink/80">
                    {account.webhookUrl}
                  </code>
                </li>
                {account.lastError && (
                  <li className="flex flex-col gap-1 px-5 py-4">
                    <span className="text-sm text-live">
                      {t("lastError")}
                    </span>
                    <span className="break-all text-xs text-ink/60">
                      {account.lastError}
                    </span>
                  </li>
                )}
              </ul>
            </Card>
          ) : (
            <p className="text-sm text-ink/60">{t("empty")}</p>
          )}

          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-line">
              <li className="flex items-center justify-between gap-3 px-5 py-4">
                <label
                  htmlFor="academy-gw-provider"
                  className="text-sm text-ink/70"
                >
                  {t("provider")}
                </label>
                <select
                  id="academy-gw-provider"
                  value={provider}
                  onChange={(e) =>
                    setProvider(e.target.value as Provider)
                  }
                  className="rounded-xl border border-line bg-elevated px-3 py-2 text-base outline-none focus:border-neon/60"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </li>
              <li className="flex flex-col gap-2 px-5 py-4">
                <label
                  htmlFor="academy-gw-key"
                  className="text-sm text-ink/70"
                >
                  {provider === "MERCADOPAGO"
                    ? t("accessToken")
                    : provider === "FINTOC"
                      ? t("secretKey")
                      : t("apiKey")}
                </label>
                <input
                  id="academy-gw-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    account ? t("replacePlaceholder") : "••••"
                  }
                  className="w-full rounded-xl border border-line bg-elevated px-3 py-2 text-base outline-none focus:border-neon/60"
                />
              </li>
              {NEEDS_SECRET.has(provider) && (
                <li className="flex flex-col gap-2 px-5 py-4">
                  <label
                    htmlFor="academy-gw-secret"
                    className="text-sm text-ink/70"
                  >
                    {provider === "FINTOC"
                      ? t("webhookSecret")
                      : t("secretKey")}
                  </label>
                  <input
                    id="academy-gw-secret"
                    type="password"
                    autoComplete="off"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    className="w-full rounded-xl border border-line bg-elevated px-3 py-2 text-base outline-none focus:border-neon/60"
                  />
                </li>
              )}
            </ul>
          </Card>
          <p className="text-xs text-ink/50">{t("hint")}</p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void save()}
              disabled={
                busy !== null ||
                !apiKey.trim() ||
                (NEEDS_SECRET.has(provider) && !secret.trim())
              }
            >
              {busy === "save" ? <Spinner /> : null}
              {account ? t("rotate") : t("save")}
            </Button>
            {account?.status === "ACTIVE" && (
              <Button
                variant="ghost"
                className="text-red-400 hover:text-red-300"
                onClick={() => setConfirmOff(true)}
              >
                {t("disable")}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Desactivar la pasarela: destructivo con ConfirmSheet (spec
          console-patterns regla 4) - tras apagarla la venta online
          queda solo por comprobante. */}
      <ConfirmSheet
        open={confirmOff}
        title={t("confirmOffTitle")}
        description={t("confirmOff")}
        confirmLabel={t("confirmYes")}
        busy={busy === "disable"}
        onConfirm={() => void disable()}
        onClose={() => setConfirmOff(false)}
      />

      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
    </section>
  );
}
