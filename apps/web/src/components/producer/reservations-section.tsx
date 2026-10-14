"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, Pager, RefreshIcon } from "@/components/ui";
import { ChevronDownIcon, SkeletonList } from "@/components/ui";
import {
  inputCls,
  readError,
  toOptionalInt,
  type TableReservationItem,
} from "./shared";

type Props = {
  eventId: string;
  tablesTotal?: number | null;
  tableSeatsTotal?: number | null;
};

const RES_STATUS_VARIANT: Record<string, "neon" | "muted" | "outline" | "live"> =
  {
    REQUESTED: "outline",
    CONFIRMED: "neon",
    CANCELLED: "muted",
  };

/**
 * Reservas de mesa del evento - vista de gestión del productor.
 * GET /events/:id/table-reservations/manage devuelve TODAS las reservas
 * con id+status (el listado público solo expone CONFIRMED sin ids).
 */
export function ReservationsSection({
  eventId,
  tablesTotal,
  tableSeatsTotal,
}: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [items, setItems] = useState<TableReservationItem[] | null>(null);
  const [error, setError] = useState(false);
  const [tableDrafts, setTableDrafts] = useState<Record<string, string>>({});
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // Vista paginada dentro de la sección: 5 / 10 / "all" con scroll
  // interno (mismo patrón que PaymentsSection).
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<5 | 10 | "all">(5);
  // Filtro por estado de la reserva - se aplica antes de paginar.
  const [status, setStatus] = useState<string>("all");
  // Fila expandida: los controles de ajuste (personas/mesa/confirmar/
  // cancelar) solo ocupan espacio en la reserva que se está editando.
  const [openId, setOpenId] = useState<string | null>(null);

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
  // inventario declarado del evento. El cupo real es en personas
  // sentables (tableSeatsTotal); tablesTotal da la lectura de mesas.
  const actives = (items ?? []).filter(
    (r) => r.status === "REQUESTED" || r.status === "CONFIRMED",
  );
  const activeCount = actives.length;
  const seatsUsed = actives.reduce((sum, r) => sum + (r.partySize ?? 0), 0);

  const filtered =
    status === "all" ? items : items?.filter((r) => r.status === status);
  const total = filtered?.length ?? 0;
  // "all" equivale a size=total: un solo slice sin páginas.
  const size = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(page, pages);
  const visible = filtered?.slice((safePage - 1) * size, safePage * size);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("sections.reservations")}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-ink/50">
            {tc("filter.status")}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="h-9 rounded-lg border border-ink/15 bg-canvas px-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <option value="all">{tc("filter.all")}</option>
              {Object.keys(RES_STATUS_VARIANT).map((s) => (
                <option key={s} value={s}>
                  {t.has(`reservations.statuses.${s}`)
                    ? t(`reservations.statuses.${s}`)
                    : s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink/50">
            {tc("pager.perPage")}
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : (Number(v) as 5 | 10));
                setPage(1);
              }}
              className="h-9 rounded-lg border border-ink/15 bg-canvas px-2 text-sm text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="all">{tc("pager.all")}</option>
            </select>
          </label>
        </div>
      </div>

      {tablesTotal != null && (
        <p className="text-xs text-ink/50">
          {t("reservations.occupancy", { used: activeCount, total: tablesTotal })}
          {tableSeatsTotal != null &&
            ` · ${t("reservations.seatsOccupancy", { used: seatsUsed, total: tableSeatsTotal })}`}
        </p>
      )}
      {tablesTotal === null && items !== null && items.length === 0 && (
        <p className="text-xs text-ink/40">{t("reservations.noTables")}</p>
      )}

      {items === null && !error && <SkeletonList items={2} lines={1} />}
      {error && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}
      {items !== null && items.length === 0 && (
        <p role="status" className="text-sm text-ink/50">
          {t("reservations.empty")}
        </p>
      )}
      {visible !== undefined &&
        visible.length === 0 &&
        items !== null &&
        items.length > 0 && (
          <p role="status" className="text-sm text-ink/50">
            {tc("filter.noResults")}
          </p>
        )}
      {visible !== undefined && visible.length > 0 && (
        <>
          <div className="max-h-[26rem] overflow-y-auto pr-1">
            <ul className="flex flex-col gap-2">
              {visible.map((r, i) => {
            const manageable = Boolean(r.id);
            const open = openId === r.id;
            const editable = manageable && r.status !== "CANCELLED";
            return (
              <li key={r.id ?? i}>
                <Card className="flex flex-col gap-2 p-3">
                  {(() => {
                    // Toda la fila header es el toggle cuando la reserva
                    // es editable: nombre + meta a la izquierda, chip y
                    // chevron pegados a la derecha.
                    const header = (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {r.person.name ?? "-"}
                          </span>
                          <span className="block text-xs text-ink/50">
                            {t("reservations.partySize", {
                              count: r.partySize,
                            })}
                            {r.tableNo
                              ? ` · ${t("reservations.table")} ${r.tableNo}`
                              : ""}
                          </span>
                        </span>
                        {r.status && (
                          <Badge
                            variant={RES_STATUS_VARIANT[r.status] ?? "muted"}
                          >
                            {t.has(`reservations.statuses.${r.status}`)
                              ? t(`reservations.statuses.${r.status}`)
                              : r.status}
                          </Badge>
                        )}
                        {editable && (
                          <ChevronDownIcon
                            className={`h-4 w-4 shrink-0 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        )}
                      </>
                    );
                    return editable ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() =>
                          setOpenId(open ? null : (r.id as string))
                        }
                        className="flex w-full items-center gap-2 rounded-lg text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                      >
                        {header}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">{header}</div>
                    );
                  })()}

                  {editable && open && (
                    <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
                      {/* El productor ajusta el tamaño al confirmar - la
                          disponibilidad es referencial (checkout declara
                          que el tamaño podría cambiar). */}
                      <label className="flex w-24 flex-col gap-1.5">
                        <span className="text-xs text-ink/50">
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
                        <span className="text-xs text-ink/50">
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
                      {r.status === "CONFIRMED" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
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
                          {t("reservations.saveChanges")}
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
          </div>
          {pageSize !== "all" ? (
            <Pager
              page={safePage}
              pageSize={pageSize}
              total={total}
              onPage={setPage}
            />
          ) : (
            <span className="text-xs tabular-nums text-ink/50">
              {tc("pager.results", { count: total })}
            </span>
          )}
        </>
      )}
    </section>
  );
}
