"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import {
  inputCls,
  readError,
  toOptionalInt,
  type TableReservationItem,
} from "./shared";

type Props = { eventId: string; tablesTotal?: number | null };

const RES_STATUS_VARIANT: Record<string, "neon" | "muted" | "outline" | "live"> =
  {
    REQUESTED: "outline",
    CONFIRMED: "neon",
    CANCELLED: "muted",
  };

/**
 * Reservas de mesa del evento — vista de gestión del productor.
 * GET /events/:id/table-reservations/manage devuelve TODAS las reservas
 * con id+status (el listado público solo expone CONFIRMED sin ids).
 */
export function ReservationsSection({ eventId, tablesTotal }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [items, setItems] = useState<TableReservationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tableDrafts, setTableDrafts] = useState<Record<string, string>>({});
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(
        `/events/${eventId}/table-reservations/manage`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = (await res.json()) as TableReservationItem[];
      setItems(data);
      setTableDrafts(
        Object.fromEntries(
          data
            .filter((r) => r.id)
            .map((r) => [r.id as string, r.tableNo ?? ""]),
        ),
      );
      setSizeDrafts(
        Object.fromEntries(
          data
            .filter((r) => r.id)
            .map((r) => [r.id as string, String(r.partySize)]),
        ),
      );
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function manage(
    id: string,
    status: "CONFIRMED" | "CANCELLED",
    tableNo?: string,
    partySize?: number,
  ) {
    if (busyId) return;
    setBusyId(id);
    setRowErrors((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    try {
      const res = await apiFetch(`/table-reservations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(tableNo !== undefined && tableNo !== ""
            ? { tableNo }
            : {}),
          ...(partySize !== undefined ? { partySize } : {}),
        }),
      });
      if (!res.ok) {
        const msg = (await readError(res)) ?? tc("error");
        setRowErrors((prev) => ({ ...prev, [id]: msg }));
        return;
      }
      await load();
    } catch {
      setRowErrors((prev) => ({ ...prev, [id]: tc("error") }));
    } finally {
      setBusyId(null);
    }
  }

  // Ocupación referencial: activas (REQUESTED+CONFIRMED) contra el
  // inventario declarado del evento (tablesTotal). null = sin mesas.
  const activeCount = (items ?? []).filter(
    (r) => r.status === "REQUESTED" || r.status === "CONFIRMED",
  ).length;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.reservations")}
      </h2>

      {tablesTotal != null && (
        <p className="text-xs text-white/50">
          {t("reservations.occupancy", { used: activeCount, total: tablesTotal })}
        </p>
      )}
      {tablesTotal === null && items !== null && items.length === 0 && (
        <p className="text-xs text-white/40">{t("reservations.noTables")}</p>
      )}

      {items === null && !error && <Spinner size="sm" className="page-loading" />}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}
      {items !== null && items.length === 0 && (
        <p role="status" className="text-sm text-white/50">
          {t("reservations.empty")}
        </p>
      )}
      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((r, i) => {
            const manageable = Boolean(r.id);
            return (
              <li key={r.id ?? i}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.person.name ?? "—"}
                      </p>
                      <p className="text-xs text-white/50">
                        {t("reservations.partySize", {
                          count: r.partySize,
                        })}
                        {r.tableNo
                          ? ` · ${t("reservations.table")} ${r.tableNo}`
                          : ""}
                      </p>
                    </div>
                    {r.status && (
                      <Badge
                        variant={RES_STATUS_VARIANT[r.status] ?? "muted"}
                      >
                        {t.has(`reservations.statuses.${r.status}`)
                          ? t(`reservations.statuses.${r.status}`)
                          : r.status}
                      </Badge>
                    )}
                  </div>

                  {manageable && r.status !== "CANCELLED" && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-night-700 pt-3">
                      {/* El productor ajusta el tamaño al confirmar — la
                          disponibilidad es referencial (checkout declara
                          que el tamaño podría cambiar). */}
                      <label className="flex w-24 flex-col gap-1.5">
                        <span className="text-xs text-white/50">
                          {t("reservations.partySizeField")}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={sizeDrafts[r.id as string] ?? ""}
                          onChange={(e) =>
                            setSizeDrafts((d) => ({
                              ...d,
                              [r.id as string]: e.target.value,
                            }))
                          }
                          className={`${inputCls} min-h-11 py-2 text-sm`}
                        />
                      </label>
                      <label className="flex min-w-28 flex-1 flex-col gap-1.5">
                        <span className="text-xs text-white/50">
                          {t("reservations.assignTable")}
                        </span>
                        <input
                          type="text"
                          autoComplete="off"
                          value={tableDrafts[r.id as string] ?? ""}
                          onChange={(e) =>
                            setTableDrafts((d) => ({
                              ...d,
                              [r.id as string]: e.target.value,
                            }))
                          }
                          className={`${inputCls} min-h-11 py-2 text-sm`}
                        />
                      </label>
                      {r.status === "REQUESTED" && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyId === r.id}
                          onClick={() =>
                            void manage(
                              r.id as string,
                              "CONFIRMED",
                              (tableDrafts[r.id as string] ?? "").trim() ||
                                undefined,
                              toOptionalInt(sizeDrafts[r.id as string] ?? ""),
                            )
                          }
                        >
                          {t("reservations.confirm")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busyId === r.id}
                        onClick={() =>
                          void manage(r.id as string, "CANCELLED")
                        }
                      >
                        {t("reservations.cancel")}
                      </Button>
                    </div>
                  )}
                  {r.id && rowErrors[r.id] && (
                    <p role="alert" className="text-sm text-red-400">
                      {rowErrors[r.id]}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
