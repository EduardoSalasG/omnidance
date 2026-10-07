"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  BackLink,
  Badge,
  Button,
  Card,
  RefreshIcon,
  SkeletonCard,
} from "@/components/ui";
import { PRODUCER_ROLES } from "@/components/producer/shared";
import { ProducerProSection } from "@/components/producer/pro-section";
import { GatewayAccountSection } from "@/components/producer/gateway-account-section";
import { ProducerPaymentMethodsSection } from "@/components/producer/payment-methods-section";

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

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

const TABLE_FIELDS = [
  "tablesTotal",
  "tableSeatMax",
  "tableSeatsTotal",
] as const;
type TableField = (typeof TABLE_FIELDS)[number];

const TABLE_LABEL_KEY: Record<TableField, string> = {
  tablesTotal: "tablesTotalLabel",
  tableSeatMax: "tableSeatMaxLabel",
  tableSeatsTotal: "tableSeatsTotalLabel",
};

/** GET /producer/table-params - defaults editables del productor. */
type TableParams = Record<TableField, number | null> & {
  /** Corte de preventa en minutos del día del evento (spec
   *  event-presale-cutoff); null = hereda el global. */
  presaleCutoffMinutes: number | null;
};

// "HH:MM" ↔ minutos del día del evento. >1439 (post-medianoche) no cabe
// en input time: queda vacío y el dirty flag evita pisarlo al guardar.
const minutesToTime = (m: number | null): string =>
  m == null || m >= 1440
    ? ""
    : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMinutes = (t: string): number | null => {
  const trimmed = t.trim();
  if (!/^\d{2}:\d{2}$/.test(trimmed)) return null;
  return Number(trimmed.slice(0, 2)) * 60 + Number(trimmed.slice(3, 5));
};

/**
 * /productor/parametros - defaults del productor. Fees: read-only (los
 * setea el admin). Mesas: editables - el productor define el inventario
 * base que heredan sus eventos nuevos (cada evento puede sobreescribir).
 * Cadena: override del evento → default del productor → global.
 */
export default function ProducerParamsPage() {
  const t = useTranslations("producer");
  const tp = useTranslations("producerParams");
  const tc = useTranslations("common");

  // /me compartido (MeProvider) - el gate se deriva del contexto y los
  // params se piden en paralelo desde el mount (un no-productor recibe
  // 403 del endpoint → el gate por rol decide, la respuesta se descarta).
  const {
    me,
    loading: meLoading,
    error: meError,
    refresh: refreshMe,
  } = useMe();
  const [params, setParams] = useState<FeeParams | null>(null);
  const [dataError, setDataError] = useState(false);
  const [dataNonce, setDataNonce] = useState(0);
  const [tables, setTables] = useState<Record<TableField, string>>({
    tablesTotal: "",
    tableSeatMax: "",
    tableSeatsTotal: "",
  });
  const [presaleCutoff, setPresaleCutoff] = useState("");
  const [cutoffDirty, setCutoffDirty] = useState(false);
  const [tableSaving, setTableSaving] = useState(false);
  const [tableMsg, setTableMsg] = useState<"saved" | "error" | null>(null);

  const gate: Gate = meLoading
    ? "loading"
    : meError
      ? "error"
      : !me
        ? "unauth"
        : !me.roles.some((r) => PRODUCER_ROLES.has(r))
          ? "notProducer"
          : "ready";
  const meId = me?.id ?? "";
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/producer/fee-params"),
      apiFetch("/producer/table-params"),
    ])
      .then(async ([res, tres]) => {
        if (cancelled) return;
        if (!res.ok || !tres.ok) {
          setDataError(true);
          return;
        }
        setDataError(false);
        setParams((await res.json()) as FeeParams);
        const tp_ = (await tres.json()) as TableParams;
        setTables({
          tablesTotal: tp_.tablesTotal != null ? String(tp_.tablesTotal) : "",
          tableSeatMax:
            tp_.tableSeatMax != null ? String(tp_.tableSeatMax) : "",
          tableSeatsTotal:
            tp_.tableSeatsTotal != null ? String(tp_.tableSeatsTotal) : "",
        });
        setPresaleCutoff(minutesToTime(tp_.presaleCutoffMinutes));
        setCutoffDirty(false);
      })
      .catch(() => {
        if (!cancelled) setDataError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataNonce]);

  async function saveTables() {
    setTableSaving(true);
    setTableMsg(null);
    try {
      const body: Record<string, number | null> = Object.fromEntries(
        TABLE_FIELDS.map((f) => {
          const v = tables[f].trim();
          return [f, v === "" ? null : Math.max(0, parseInt(v, 10) || 0)];
        }),
      );
      // El corte solo se envía si el productor lo tocó: sin dirty, un
      // valor post-medianoche guardado por admin/API no se pisa.
      if (cutoffDirty) {
        body.presaleCutoffMinutes =
          presaleCutoff.trim() === ""
            ? null
            : timeToMinutes(presaleCutoff);
      }
      const res = await apiFetch("/producer/table-params", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setTableMsg(res.ok ? "saved" : "error");
    } catch {
      setTableMsg("error");
    } finally {
      setTableSaving(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-4xl lg:px-8">
      <BackLink href="/productor">{t("title")}</BackLink>

      {gate === "loading" && (
        <div className="flex flex-col gap-6" aria-hidden="true">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      )}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-ink/70">{t("notProducer")}</p>
          <Button href="/inicio" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-ink/70">
            {tc("error")}
          </p>
          <Button variant="secondary" onClick={() => void refreshMe()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && dataError && (
        <div className="flex flex-col items-start gap-4">
          <p role="alert" className="text-ink/70">
            {tc("error")}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setParams(null);
              setDataError(false);
              setDataNonce((n) => n + 1);
            }}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && !dataError && params === null && (
        <div className="flex flex-col gap-6" aria-hidden="true">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </div>
      )}

      {gate === "ready" && params && (
        <>
          {/* Suscripción Producer Pro (S6) - contratación/gestión; el
              paywall de las features Pro apunta acá. Solo para quien
              tiene el rol (un ADMIN operando la consola no se suscribe
              a sí mismo). */}
          {isProducer && <ProducerProSection producerId={meId} />}

          {/* Pasarela propia (spec producer-gateway-accounts): cuenta
              Flow/MP cifrada que cobra sus ventas; sin cuenta, la
              plataforma cobra por el default MANAGED. */}
          {isProducer && <GatewayAccountSection />}

          {/* Medios de cobro propios (spec producer-own-methods):
              transferencia/link/efectivo que el comprador elige en el
              checkout; la cola de comprobantes vive en
              /productor/comprobantes. */}
          {isProducer && <ProducerPaymentMethodsSection />}

          <p className="text-xs text-ink/50">{tp("hint")}</p>

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

          {/* Defaults de mesas - editables por el productor. Los eventos
              nuevos los heredan salvo que el productor los cambie ahí. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
              {tp("tablesTitle")}
            </h2>
            <Card padded={false}>
              <ul className="flex flex-col divide-y divide-line">
                {TABLE_FIELDS.map((f) => (
                  <li
                    key={f}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <label
                      htmlFor={`tp-${f}`}
                      className="text-sm text-ink/70"
                    >
                      {tp(TABLE_LABEL_KEY[f])}
                    </label>
                    <input
                      id={`tp-${f}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={tables[f]}
                      onChange={(e) =>
                        setTables((s) => ({ ...s, [f]: e.target.value }))
                      }
                      placeholder="·"
                      className="w-24 rounded-xl border border-line bg-elevated px-3 py-2 text-right text-base tabular-nums outline-none focus:border-neon/60"
                    />
                  </li>
                ))}
              </ul>
            </Card>
            <Card padded={false}>
              <ul className="flex flex-col divide-y divide-line">
                <li className="flex items-center justify-between gap-3 px-5 py-4">
                  <label
                    htmlFor="tp-presaleCutoff"
                    className="text-sm text-ink/70"
                  >
                    {tp("presaleCutoffLabel")}
                  </label>
                  <input
                    id="tp-presaleCutoff"
                    type="time"
                    value={presaleCutoff}
                    onChange={(e) => {
                      setCutoffDirty(true);
                      setPresaleCutoff(e.target.value);
                    }}
                    className="w-28 rounded-xl border border-line bg-elevated px-3 py-2 text-right text-base tabular-nums outline-none focus:border-neon/60"
                  />
                </li>
              </ul>
            </Card>
            <p className="text-xs text-ink/50">{tp("tablesHint")}</p>
            <p className="text-xs text-ink/50">{tp("presaleCutoffHint")}</p>
            <div className="flex items-center gap-3">
              <Button
                onClick={() => void saveTables()}
                disabled={tableSaving}
              >
                {tableSaving ? "…" : tp("save")}
              </Button>
              {tableMsg === "saved" && (
                <span role="status" className="text-sm text-neon">
                  {tp("saved")}
                </span>
              )}
              {tableMsg === "error" && (
                <span role="alert" className="text-sm text-live">
                  {tp("error")}
                </span>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
