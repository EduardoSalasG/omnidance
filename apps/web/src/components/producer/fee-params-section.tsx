"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";

const FEE_FIELDS = ["platformFeePct"] as const;
type FeeField = (typeof FEE_FIELDS)[number];
type FeeValues = Record<FeeField, number | null>;

const FEE_LABEL_KEY: Record<FeeField, string> = {
  platformFeePct: "platformFeePct",
};

/** GET /producer/fee-params - defaults propios + resolución efectiva. */
type FeeParams = {
  defaults: FeeValues;
  effective: FeeValues;
};

/**
 * Card "Comisión todo incluido" - read-only (los valores los setea el
 * admin; cadena: override del evento → default del productor → global).
 * Vive en /productor/suscripcion: es parte del plan/comisión, no de los
 * defaults operativos.
 */
export function FeeParamsSection() {
  const tp = useTranslations("producerParams");
  const tc = useTranslations("common");
  const [params, setParams] = useState<FeeParams | null>(null);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/producer/fee-params")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        setError(false);
        setParams((await res.json()) as FeeParams);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-ink/70">
          {tc("error")}
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setParams(null);
            setError(false);
            setNonce((n) => n + 1);
          }}
        >
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  }

  if (!params) {
    return <SkeletonCard lines={2} />;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {tp("feeTitle")}
      </h2>
      <Card padded={false}>
        <ul className="flex flex-col divide-y divide-line">
          {FEE_FIELDS.map((f) => {
            const custom = params.defaults[f] != null;
            const effective = params.effective[f];
            return (
              <li
                key={f}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm text-ink/70">
                    {tp(FEE_LABEL_KEY[f])}
                  </span>
                  <Badge variant={custom ? "neon" : "muted"}>
                    {custom ? tp("custom") : tp("inherits")}
                  </Badge>
                </div>
                <span className="text-base">
                  {effective != null ? (
                    <span className="font-semibold text-neon">
                      {effective}%
                    </span>
                  ) : (
                    <span className="text-ink/50">·</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-ink/50">{tp("readOnly")}</p>
        <p className="text-xs text-ink/50">{tp("perEvent")}</p>
      </div>
    </section>
  );
}
