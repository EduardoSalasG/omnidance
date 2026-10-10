"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import {
  Badge,
  Button,
  Card,
  Pager,
  PriceTag,
  RefreshIcon,
  SkeletonList,
} from "@/components/ui";
import { FilterBar } from "@/components/query/FilterBar";
import {
  GUESTLIST_ENTRY_STATUSES,
  filtersParams,
} from "./shared";
import type { EntityDef, QueryFilters } from "@omnidance/shared";

type GuestListEntry = {
  id: string;
  personId: string;
  status: string; // "PENDING" | "ARRIVED"
  person: { personId: string; name: string; photoUrl: string | null };
};

type GuestList = {
  id: string;
  eventId: string;
  ownerId: string;
  label: string | null;
  specialPrice: number | null;
  owner: { personId: string; name: string; photoUrl: string | null };
  entries: GuestListEntry[];
};

/**
 * Filtros de las listas dentro de la ficha del evento - mismo vocabulario
 * que la entidad guestlist del catálogo (spec analytics/query-console):
 * status de entries (PENDING|ARRIVED) y q (invitado / etiqueta) viajan a
 * GET /events/:id/guest-lists. El evento ya es el contexto - no hay
 * selector de evento.
 */
const LISTS_ENTITY: EntityDef = {
  entity: "guestlist",
  filters: [
    { key: "status", type: "enum", options: GUESTLIST_ENTRY_STATUSES },
    { key: "q", type: "text" },
  ],
  columns: [],
};

const PAGE_SIZE = 25;

/**
 * Listas de invitados del evento (spec events/producer-console): vive
 * dentro de la ficha - GET /events/:id/guest-lists carga directo las
 * listas de ESTE evento. Crear lista navega a /productor/listas/nueva
 * ?eventId= (formulario dedicado, no inline). La ficha de cada lista
 * queda en /productor/listas/[id] con back a este evento.
 */
export function EventListsSection({ eventId }: { eventId: string }) {
  const t = useTranslations("producer");
  const ta = useTranslations("admin");
  const tc = useTranslations("common");

  const [filters, setFilters] = useState<QueryFilters>({});
  const [lists, setLists] = useState<GuestList[] | null>(null);
  const [listsTotal, setListsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState(false);

  const loadLists = useCallback(
    async (f: QueryFilters, pageNo: number) => {
      setListsLoading(true);
      setListsError(false);
      try {
        const qs = filtersParams({
          status: f.status ?? "",
          q: f.q ?? "",
        });
        const res = await apiFetch(
          `/events/${eventId}/guest-lists${qs}${qs ? "&" : "?"}page=${pageNo}&pageSize=${PAGE_SIZE}`,
        );
        if (!res.ok) {
          setListsError(true);
          setLists([]);
          return;
        }
        const data = (await res.json()) as {
          items: GuestList[];
          total: number;
        };
        setLists(data.items);
        setListsTotal(data.total);
      } catch {
        setListsError(true);
        setLists([]);
      } finally {
        setListsLoading(false);
      }
    },
    [eventId],
  );

  // FilterBar controlled: cualquier cambio (status, q debounced) recarga
  // las listas y vuelve a pág. 1.
  useEffect(() => {
    setPage(1);
    void loadLists(filters, 1);
  }, [filters, loadLists]);

  useEffect(() => {
    if (page !== 1) void loadLists(filters, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
          {t("sections.lists")}
        </h2>
        <Button
          size="sm"
          variant="secondary"
          href={`/productor/listas/nueva?eventId=${eventId}`}
        >
          {`＋ ${t("newList")}`}
        </Button>
      </div>

      {listsLoading && lists === null && (
        <SkeletonList items={2} lines={1} />
      )}
      {listsError && (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-red-400">
            {tc("error")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void loadLists(filters, page)}
          >
            <RefreshIcon /> {tc("retry")}
          </Button>
        </div>
      )}

      {lists !== null && lists.length > 1 && (
        <FilterBar
          entity={LISTS_ENTITY}
          filters={filters}
          onChange={setFilters}
          options={{}}
        />
      )}

      {!listsError && lists !== null && (
        <>
          {lists.length === 0 ? (
            <Card className="flex flex-col items-center gap-4 py-10 text-center">
              <p role="status" className="text-ink/70">
                {t("listsEmpty")}
              </p>
              <Button
                variant="secondary"
                href={`/productor/listas/nueva?eventId=${eventId}`}
              >
                {`＋ ${t("newList")}`}
              </Button>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
              {lists.map((l) => (
                <li key={l.id}>
                  <Link href={`/productor/listas/${l.id}`} className="block">
                    <Card className="flex flex-col gap-3 transition-colors hover:border-neon/60">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">
                          {l.label ?? l.owner.name}
                        </h3>
                        <Badge variant="muted">
                          {t("listDetail.entriesCount", {
                            count: l.entries.length,
                          })}
                        </Badge>
                      </div>

                      {l.specialPrice !== null && (
                        <PriceTag amount={l.specialPrice} className="text-sm" />
                      )}

                      {l.entries.length > 0 && (
                        <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                          {l.entries.slice(0, 5).map((en) => (
                            <li
                              key={en.id}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="truncate">{en.person.name}</span>
                              <Badge
                                variant={
                                  en.status === "ARRIVED" ? "neon" : "muted"
                                }
                              >
                                {ta.has(`status.${en.status}`)
                                  ? ta(`status.${en.status}`)
                                  : en.status}
                              </Badge>
                            </li>
                          ))}
                          {l.entries.length > 5 && (
                            <li className="text-xs text-ink/40">
                              +{l.entries.length - 5}
                            </li>
                          )}
                        </ul>
                      )}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {lists.length > 0 && (
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={listsTotal}
              onPage={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}
