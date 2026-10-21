"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  Badge,
  Button,
  Card,
  EventDate,
  RefreshIcon,
  SkeletonList,
  Spinner,
  type BadgeVariant,
} from "@/components/ui";
import { readError } from "@/components/academy/shared";
import { inputCls } from "@/components/producer/shared";

/** GET /me/payout-destinations - shape del PayoutDestination de Prisma
 *  serializado (spec payouts/payout-rails): rail STRIPE_CONNECT con
 *  externalId = acct_…; lastError/onboardedAt opcionales. */
type PayoutDestination = {
  id: string;
  actorType: string;
  actorId: string;
  rail: string;
  externalId: string;
  country: string;
  currency: string;
  status: string;
  lastError?: string | null;
  onboardedAt?: string | null;
};

// Whitelist ISO-2 de países con Connect Express habilitados para la
// plataforma hoy (el mercado lo declara el actor, no se deduce). El
// resto queda como opción deshabilitada hasta que Stripe los cubra.
const CONNECT_COUNTRIES = [
  "CL",
  "MX",
  "AR",
  "CO",
  "PE",
  "UY",
  "BR",
  "US",
  "ES",
  "PT",
  "GB",
  "DE",
  "FR",
] as const;

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  PENDING: "outline",
  ACTIVE: "neon",
  DISABLED: "muted",
};

type LoadState = "loading" | "error" | "unavailable" | "ready";

/**
 * Sección "Cuenta de desembolso" de /productor/pagos (change
 * payout-destinations-front): lista los PayoutDestination del actor
 * (GET devuelve también los de academias/venues propias - se listan
 * con su actor) y da de alta el del PRODUCER vía Connect Express:
 * POST /me/payout-destinations → redirect al onboardingUrl (Account
 * Link, vuelve a esta misma página). Sin STRIPE_SECRET_KEY el API
 * responde 503 → estado "unavailable" con mensaje claro, nunca
 * spinner infinito.
 */
export function DisbursementAccountSection() {
  const t = useTranslations("producer.disbursement");
  const tc = useTranslations("common");
  const locale = useLocale();
  const { me } = useMe();
  // me.id ES el personId (misma identidad que usan los gates me.id ===
  // ownerId por toda la consola) - PRODUCER = la persona misma.
  const personId = me?.id ?? "";

  const [destinations, setDestinations] = useState<PayoutDestination[]>(
    [],
  );
  const [state, setState] = useState<LoadState>("loading");
  const [nonce, setNonce] = useState(0);
  const [country, setCountry] = useState<string>("CL");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/me/payout-destinations");
      if (res.status === 503) {
        setState("unavailable");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setDestinations((await res.json()) as PayoutDestination[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  // Nombres de país en el locale activo (Intl.DisplayNames); si el
  // runtime no lo soporta se muestra el ISO-2 tal cual.
  const regionNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  }, [locale]);
  const countryName = (code: string) => regionNames?.of(code) ?? code;

  // El CTA opera solo el actor PRODUCER (v1 de la UI; el endpoint ya
  // soporta ACADEMY/VENUE con un selector de actor futuro).
  const producerDest = destinations.find((d) => d.actorType === "PRODUCER");

  async function connect() {
    if (!personId || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch("/me/payout-destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actorType: "PRODUCER",
          actorId: personId,
          // Reintento PENDING: el API reusa la acct_ y su país remoto
          // (ignora el del body) - se envía el del destino por
          // honestidad del contrato.
          country:
            producerDest?.status === "PENDING"
              ? producerDest.country
              : country,
        }),
      });
      if (res.status === 409) {
        // Ya quedó ACTIVE (p.ej. onboarding completado en otra
        // pestaña): refrescar el listado es la resolución.
        await load();
        return;
      }
      if (res.status === 403) {
        setFormError(t("forbidden"));
        return;
      }
      if (res.status === 503) {
        setState("unavailable");
        return;
      }
      if (!res.ok) {
        setFormError((await readError(res)) ?? t("connectError"));
        return;
      }
      const body = (await res.json()) as { onboardingUrl?: string };
      if (!body.onboardingUrl) {
        setFormError(t("connectError"));
        return;
      }
      // Account Link de un solo uso: se consume al tiro; al volver a
      // /productor/pagos el GET hace el flip PENDING→ACTIVE.
      window.location.href = body.onboardingUrl;
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  // Form de alta (select país + CTA) - compartido por el empty state y
  // por la card de alta cuando hay destinos de otros actores o el
  // propio quedó DISABLED. Es variable JSX (no componente inline) para
  // no remontar el select en cada render.
  const connectForm = (
    <div className="flex w-full max-w-sm flex-col gap-2 text-left">
      <label
        htmlFor="payout-dest-country"
        className="text-sm text-ink/70"
      >
        {t("country")}
      </label>
      <select
        id="payout-dest-country"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        disabled={busy}
        className={inputCls}
      >
        {CONNECT_COUNTRIES.map((c) => (
          <option key={c} value={c}>
            {countryName(c)}
          </option>
        ))}
        <option value="OTHER" disabled>
          {t("otherCountry")}
        </option>
      </select>
      <p className="text-xs text-ink/50">{t("countryHelper")}</p>
      <Button
        className="self-start"
        onClick={() => void connect()}
        disabled={busy || !personId}
      >
        {busy ? <Spinner size="sm" /> : null}
        {t("connectCta")}
      </Button>
    </div>
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink/80">{t("title")}</h2>
      <p className="text-xs text-ink/50">{t("desc")}</p>

      {state === "loading" && <SkeletonList items={1} />}

      {state === "unavailable" && (
        <Card>
          <p role="alert" className="text-sm text-ink/70">
            {t("unavailable")}
          </p>
        </Card>
      )}

      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button
            size="sm"
            variant="ghost"
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
          {destinations.length === 0 ? (
            <Card className="flex flex-col items-center gap-4 py-8 text-center">
              <p role="status" className="max-w-md text-ink/70">
                {t("empty")}
              </p>
              {connectForm}
            </Card>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {destinations.map((d) => (
                  <li key={d.id}>
                    <Card className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-wide text-ink/50">
                            {t("rail")}
                            {d.actorType !== "PRODUCER" &&
                            t.has(`actorTypes.${d.actorType}`)
                              ? ` · ${t(`actorTypes.${d.actorType}`)}`
                              : ""}
                          </p>
                          <p className="font-medium">
                            {countryName(d.country)} · {d.currency}
                          </p>
                        </div>
                        <Badge variant={STATUS_VARIANT[d.status] ?? "muted"}>
                          {t.has(`status.${d.status}`)
                            ? t(`status.${d.status}`)
                            : d.status}
                        </Badge>
                      </div>
                      <p className="break-all text-xs text-ink/40">
                        {d.externalId}
                      </p>
                      {d.onboardedAt && (
                        <p className="text-sm text-ink/50">
                          {t("onboardedAt")}:{" "}
                          <EventDate start={d.onboardedAt} />
                        </p>
                      )}
                      {d.status === "PENDING" && (
                        <p role="status" className="text-sm text-ink/60">
                          {t("pendingHint")}
                        </p>
                      )}
                      {d.lastError && (
                        <p
                          role="alert"
                          className="break-all text-xs text-red-400/90"
                        >
                          {t("lastError")}: {d.lastError}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>

              {/* CTAs según el estado del destino PRODUCER: ACTIVE no
                  muestra nada (un alta daría 409); PENDING reanuda el
                  onboarding sobre la misma acct_ (sin select de país -
                  el de la cuenta remota manda); ausente o DISABLED
                  muestra el alta completa. */}
              {producerDest?.status === "PENDING" && (
                <Button
                  className="self-start"
                  onClick={() => void connect()}
                  disabled={busy}
                >
                  {busy ? <Spinner size="sm" /> : null}
                  {t("continueCta")}
                </Button>
              )}
              {(!producerDest || producerDest.status === "DISABLED") && (
                <Card>{connectForm}</Card>
              )}
            </>
          )}

          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {formError}
            </p>
          )}
        </>
      )}
    </section>
  );
}
