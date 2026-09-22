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

/** GET /producer/table-params — defaults editables del productor. */
type TableParams = Record<TableField, number | null>;

/**
 * /productor/parametros — defaults del productor. Fees: read-only (los
 * setea el admin). Mesas: editables — el productor define el inventario
 * base que heredan sus eventos nuevos (cada evento puede sobreescribir).
 * Cadena: override del evento → default del productor → global.
 */
export default function ProducerParamsPage() {
  const t = useTranslations("producer");
  const tp = useTranslations("producerParams");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [params, setParams] = useState<FeeParams | null>(null);
  const [tables, setTables] = useState<Record<TableField, string>>({
    tablesTotal: "",
    tableSeatMax: "",
    tableSeatsTotal: "",
  });
  const [tableSaving, setTableSaving] = useState(false);
  const [tableMsg, setTableMsg] = useState<"saved" | "error" | null>(null);

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

      const [res, tres] = await Promise.all([
        apiFetch("/producer/fee-params"),
        apiFetch("/producer/table-params"),
      ]);
      if (res.status === 403 || tres.status === 403) {
        setGate("notProducer");
        return;
      }
      if (!res.ok || !tres.ok) {
        setGate("error");
        return;
      }
      setParams((await res.json()) as FeeParams);
      const tp_ = (await tres.json()) as TableParams;
      setTables({
        tablesTotal: tp_.tablesTotal != null ? String(tp_.tablesTotal) : "",
        tableSeatMax:
          tp_.tableSeatMax != null ? String(tp_.tableSeatMax) : "",
        tableSeatsTotal:
          tp_.tableSeatsTotal != null ? String(tp_.tableSeatsTotal) : "",
      });
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function saveTables() {
    setTableSaving(true);
    setTableMsg(null);
    try {
      const body = Object.fromEntries(
        TABLE_FIELDS.map((f) => {
          const v = tables[f].trim();
          return [f, v === "" ? null : Math.max(0, parseInt(v, 10) || 0)];
        }),
      );
      const res = await apiFetch("/producer/table-params", {
        method: "PUT",
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

          {/* Defaults de mesas — editables por el productor. Los eventos
              nuevos los heredan salvo que el productor los cambie ahí. */}
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {tp("tablesTitle")}
            </h2>
            <Card padded={false}>
              <ul className="flex flex-col divide-y divide-night-700">
                {TABLE_FIELDS.map((f) => (
                  <li
                    key={f}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <label
                      htmlFor={`tp-${f}`}
                      className="text-sm text-white/70"
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
                      placeholder="—"
                      className="w-24 rounded-xl border border-night-700 bg-night-800 px-3 py-2 text-right text-base tabular-nums outline-none focus:border-neon/60"
                    />
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-xs text-white/50">{tp("tablesHint")}</p>
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
