"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";

type Props = { eventId: string; status: string };

// GET /events/:id/live — tablero operativo owner/admin (spec §13
// Productor: "pulso en vivo"). Para CLOSED funciona como cierre de
// noche (ventas + asistencia); DRAFT/CANCELLED no lo muestran.
type LiveData = {
  eventId: string;
  status: string;
  sales: {
    presale: { count: number; amount: number };
    door: { count: number; amount: number; manual: number };
    total: { count: number; amount: number };
  };
  checkins: { total: number; lastHour: number; byHour: number[] };
  capacity: number | null;
  occupancy: number | null;
  passes: number;
};

const LIVE_STATUSES = new Set(["PUBLISHED", "LIVE", "CLOSED"]);
// Ventana nocturna del histograma: 19:00 → 05:00.
const FLOW_HOURS = [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const num = new Intl.NumberFormat("es-CL");

export function LiveSection({ eventId, status }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [data, setData] = useState<LiveData | null>(null);
  const [state, setState] = useState<"loading" | "error" | "hidden" | "ready">(
    "loading",
  );

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch(`/events/${eventId}/live`);
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        setState("hidden");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setData((await res.json()) as LiveData);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [eventId]);

  useEffect(() => {
    if (LIVE_STATUSES.has(status)) void load();
    else setState("hidden");
  }, [status, load]);

  if (state === "hidden") return null;

  const max = data ? Math.max(...data.checkins.byHour, 1) : 1;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {status === "LIVE" ? t("live.title") : t("live.titlePast")}
      </h2>

      {state === "loading" && <Spinner size="sm" className="page-loading" />}
      {state === "error" && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {state === "ready" && data && (
        <Card className="flex flex-col gap-4">
          {/* Ventas por canal — preventa / puerta app / puerta manual. */}
          <ul className="grid grid-cols-3 gap-3">
            <li>
              <span className="block text-xl font-bold tabular-nums text-neon">
                {num.format(data.sales.presale.count)}
              </span>
              <span className="block text-xs text-white/50">
                {t("live.presale")}
              </span>
              <span className="block text-xs tabular-nums text-white/40">
                {clp.format(data.sales.presale.amount)}
              </span>
            </li>
            <li>
              <span className="block text-xl font-bold tabular-nums text-neon">
                {num.format(data.sales.door.count + data.sales.door.manual)}
              </span>
              <span className="block text-xs text-white/50">
                {t("live.door")}
              </span>
              <span className="block text-xs tabular-nums text-white/40">
                {clp.format(data.sales.door.amount)}
                {data.sales.door.manual > 0 &&
                  ` · ${t("live.doorManual", { count: data.sales.door.manual })}`}
              </span>
            </li>
            <li>
              <span className="block text-xl font-bold tabular-nums text-neon">
                {num.format(data.sales.total.count)}
              </span>
              <span className="block text-xs text-white/50">
                {t("live.totalSold")}
              </span>
              <span className="block text-xs tabular-nums text-white/40">
                {clp.format(data.sales.total.amount)}
              </span>
            </li>
          </ul>

          {/* Check-ins + ocupación vs aforo. */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-night-700 pt-3 text-sm">
            <p>
              <span className="text-xl font-bold tabular-nums text-neon">
                {num.format(data.checkins.total)}
              </span>{" "}
              <span className="text-white/50">{t("live.checkins")}</span>
            </p>
            {status === "LIVE" && (
              <p>
                <span className="font-semibold tabular-nums">
                  +{num.format(data.checkins.lastHour)}
                </span>{" "}
                <span className="text-white/50">{t("live.lastHour")}</span>
              </p>
            )}
            {data.occupancy != null && data.capacity != null && (
              <p>
                <span className="font-semibold tabular-nums">
                  {Math.round(data.occupancy * 100)}%
                </span>{" "}
                <span className="text-white/50">
                  {t("live.occupancy", { capacity: data.capacity })}
                </span>
              </p>
            )}
            {data.passes > 0 && (
              <p className="text-xs text-white/40">
                {t("live.passes", { count: data.passes })}
              </p>
            )}
          </div>

          {/* Llegadas por hora — ventana nocturna 19→05. */}
          {data.checkins.total > 0 && (
            <div>
              <div
                className="flex h-14 items-end gap-1"
                role="img"
                aria-label={t("live.chartLabel")}
              >
                {FLOW_HOURS.map((h) => {
                  const v = data.checkins.byHour[h] ?? 0;
                  return (
                    <span
                      key={h}
                      title={`${h}:00 — ${num.format(v)}`}
                      className="flex-1 rounded-sm bg-neon/60"
                      style={{
                        height: `${Math.max(4, (v / max) * 100)}%`,
                        opacity: v === 0 ? 0.15 : undefined,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10px] tabular-nums text-white/40">
                <span>19:00</span>
                <span>00:00</span>
                <span>05:00</span>
              </div>
            </div>
          )}
        </Card>
      )}
    </section>
  );
}
