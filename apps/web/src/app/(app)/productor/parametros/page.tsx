"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { BackLink, Badge, Button, Card, PriceTag } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { PRODUCER_ROLES } from "@/components/producer/shared";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

const FEE_FIELDS = [
  "serviceFeeClp",
  "doorAppFeeClp",
  "doorCashFeeClp",
  "platformFeePct",
] as const;
type FeeField = (typeof FEE_FIELDS)[number];
type FeeValues = Record<FeeField, number | null>;

const FEE_LABEL_KEY: Record<FeeField, string> = {
  serviceFeeClp: "serviceFee",
  doorAppFeeClp: "doorAppFee",
  doorCashFeeClp: "doorCashFee",
  platformFeePct: "platformFeePct",
};

/** GET /producer/fee-params — defaults propios + resolución efectiva. */
type FeeParams = {
  defaults: FeeValues;
  effective: FeeValues;
};

/**
 * /productor/parametros — vista read-only de los defaults de fees del
 * productor (los setea el admin; cada evento puede sobreescribirlos).
 * Cadena: override del evento → default del productor → global.
 */
export default function ProducerParamsPage() {
  const t = useTranslations("producer");
  const tp = useTranslations("producerParams");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [params, setParams] = useState<FeeParams | null>(null);

  const boot = useCallback(async () => {
    setGate("loading");
    try {
      const me = await apiFetch("/me");
      if (me.status === 401) {
        setGate("unauth");
        return;
      }
      if (!me.ok) {
        setGate("error");
        return;
      }
      const data = (await me.json()) as { id: string; roles: string[] };
      if (!data.roles.some((r) => PRODUCER_ROLES.has(r))) {
        setGate("notProducer");
        return;
      }

      const res = await apiFetch("/producer/fee-params");
      if (res.status === 403) {
        setGate("notProducer");
        return;
      }
      if (!res.ok) {
        setGate("error");
        return;
      }
      setParams((await res.json()) as FeeParams);
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <BackLink href="/productor">{t("title")}</BackLink>

      {gate === "loading" && <PageLoading />}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notProducer")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-white/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && params && (
        <>
          <p className="text-xs text-white/50">{tp("hint")}</p>

          <Card padded={false}>
            <ul className="flex flex-col divide-y divide-night-700">
              {FEE_FIELDS.map((f) => {
                const isPct = f === "platformFeePct";
                const custom = params.defaults[f] != null;
                const effective = params.effective[f];
                return (
                  <li
                    key={f}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm text-white/70">
                        {tp(FEE_LABEL_KEY[f])}
                      </span>
                      <Badge variant={custom ? "neon" : "muted"}>
                        {custom ? tp("custom") : tp("inherits")}
                      </Badge>
                    </div>
                    <span className="text-base">
                      {isPct ? (
                        effective != null ? (
                          <span className="font-semibold text-neon">
                            {effective}%
                          </span>
                        ) : (
                          <span className="text-white/50">—</span>
                        )
                      ) : (
                        <PriceTag amount={effective} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="flex flex-col gap-1">
            <p className="text-xs text-white/50">{tp("readOnly")}</p>
            <p className="text-xs text-white/50">{tp("perEvent")}</p>
          </div>
        </>
      )}
    </main>
  );
}
