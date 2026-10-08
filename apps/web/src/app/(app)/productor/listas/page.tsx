"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag, RefreshIcon } from "@/components/ui";
import { SkeletonList } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { FilterBar } from "@/components/query/FilterBar";
import {
  GUESTLIST_ENTRY_STATUSES,
  filtersParams,
  inputCls,
  type EventListItem,
} from "@/components/producer/shared";
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
 * Filtros de /productor/listas - contrato compartido (spec
 * analytics/query-console), mismo vocabulario que la entidad guestlist
 * del catálogo: evento propio (fk, opciones del mismo /events/mine que
 * ya cargaba la página), status de entries (PENDING|ARRIVED) y q
 * (invitado / dueño / etiqueta) — status y q van a
 * GET /events/:id/guest-lists.
 */
const LISTS_ENTITY: EntityDef = {
  entity: "guestlist",
  filters: [
    { key: "eventId", type: "fk", source: "events" },
    { key: "status", type: "enum", options: GUESTLIST_ENTRY_STATUSES },
    { key: "q", type: "text" },
  ],
  columns: [],
};

function GuestLists() {
  const t = useTranslations("producer");
  const ta = useTranslations("admin");
  const tac = useTranslations("academy");
  const tc = useTranslations("common");

  const [events, setEvents] = useState<EventListItem[] | null>(null);

  // Filtros compartidos: eventId elige el evento (path param), status/q
  // van como query params al endpoint de guest-lists.
  const [filters, setFilters] = useState<QueryFilters>({});
  const listEventId = filters.eventId ?? "";
  const [lists, setLists] = useState<GuestList[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState(false);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, string>>({});
  const [entrySaving, setEntrySaving] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);

  const loadLists = useCallback(async (f: QueryFilters) => {
    const eventId = f.eventId;
    if (!eventId) {
      setLists(null);
      return;
    }
    setListsLoading(true);
    setListsError(false);
    try {
      const res = await apiFetch(
        `/events/${eventId}/guest-lists${filtersParams({
          status: f.status ?? "",
          q: f.q ?? "",
        })}`,
      );
      if (!res.ok) {
        setListsError(true);
        setLists([]);
        return;
      }
      setLists((await res.json()) as GuestList[]);
    } catch {
      setListsError(true);
      setLists([]);
    } finally {
      setListsLoading(false);
    }
  }, []);

  const boot = useCallback(async () => {
    // Eventos propios para el selector (/events/mine cubre todos los
    // estados - las listas también se crean sobre borradores).
    const evRes = await apiFetch("/events/mine");
    if (evRes.ok) {
      const evs = (await evRes.json()) as EventListItem[];
      setEvents(evs);
      if (evs.length > 0) {
        setFilters({ eventId: evs[0].id });
      }
    } else {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  // El FilterBar es controlled: cualquier cambio (evento, status, q
  // debounced) recarga las listas del evento elegido.
  useEffect(() => {
    void loadLists(filters);
  }, [filters, loadLists]);

  async function addEntry(listId: string) {
    const personId = (entryDrafts[listId] ?? "").trim();
    if (!personId || entrySaving) return;
    setEntrySaving(listId);
    setEntryError(null);
    try {
      const res = await apiFetch(`/guest-lists/${listId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId }),
      });
      if (!res.ok) {
        // 404 persona no encontrada / 409 duplicado → error genérico en v1.
        setEntryError(listId);
        return;
      }
      setEntryDrafts((d) => ({ ...d, [listId]: "" }));
      await loadLists(filters);
    } catch {
      setEntryError(listId);
    } finally {
      setEntrySaving(null);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref="/productor"
        backLabel={t("title")}
        actions={
          events !== null && events.length > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              href="/productor/listas/nueva"
            >
              {`＋ ${t("newList")}`}
            </Button>
          ) : null
        }
      />

      <section className="flex flex-col gap-4">
        {events === null ? (
          <SkeletonList items={2} lines={1} />
        ) : events.length === 0 ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p role="status" className="text-ink/70">
              {t("emptyEvents")}
            </p>
            <Button href="/productor/eventos/nuevo">
              {t("emptyEventsCta")}
            </Button>
          </Card>
        ) : (
          <>
            <FilterBar
              entity={LISTS_ENTITY}
              filters={filters}
              onChange={setFilters}
              options={{
                events: events.map((ev) => ({ value: ev.id, label: ev.name })),
              }}
            />

            {!listEventId && (
              <p className="text-sm text-ink/60">{t("pickEvent")}</p>
            )}

            {listEventId && listsLoading && (
              <SkeletonList items={2} lines={1} />
            )}
            {listsError && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-400">{tc("error")}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadLists(filters)}
                >
                  <RefreshIcon /> {tc("retry")}
                </Button>
              </div>
            )}
            {!listsLoading && !listsError && lists !== null && (
              <>
                {lists.length === 0 ? (
                  <Card className="flex flex-col items-center gap-4 py-10 text-center">
                    <p role="status" className="text-ink/70">
                      {t("listsEmpty")}
                    </p>
                    <Button href="/productor/listas/nueva">
                      {`＋ ${t("newList")}`}
                    </Button>
                  </Card>
                ) : (
                  <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
                    {lists.map((l) => (
                      <li key={l.id}>
                        <Card className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="font-semibold">
                              {l.label ?? l.owner.name}
                            </h3>
                            {l.specialPrice !== null && (
                              <PriceTag
                                amount={l.specialPrice}
                                className="text-sm"
                              />
                            )}
                          </div>

                          {l.entries.length > 0 && (
                            <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                              {l.entries.map((en) => (
                                <li
                                  key={en.id}
                                  className="flex items-center justify-between gap-3 text-sm"
                                >
                                  <span className="truncate">
                                    {en.person.name}
                                  </span>
                                  <Badge
                                    variant={
                                      en.status === "ARRIVED"
                                        ? "neon"
                                        : "muted"
                                    }
                                  >
                                    {ta.has(`status.${en.status}`)
                                      ? ta(`status.${en.status}`)
                                      : en.status}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}

                          <form
                            className="flex gap-2 border-t border-line pt-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void addEntry(l.id);
                            }}
                          >
                            <input
                              type="text"
                              autoComplete="off"
                              placeholder={tac("personId")}
                              aria-label={`${t("addPerson")}: ${l.label ?? l.owner.name}`}
                              value={entryDrafts[l.id] ?? ""}
                              onChange={(e) =>
                                setEntryDrafts((d) => ({
                                  ...d,
                                  [l.id]: e.target.value,
                                }))
                              }
                              className={`${inputCls} min-h-11 flex-1 py-2 text-sm`}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              variant="secondary"
                              disabled={
                                !(entryDrafts[l.id] ?? "").trim() ||
                                entrySaving === l.id
                              }
                            >
                              {t("addPerson")}
                            </Button>
                          </form>
                          {entryError === l.id && (
                            <p role="alert" className="text-sm text-red-400">
                              {tc("error")}
                            </p>
                          )}
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

export default function ProducerListsPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      <ProducerGate>
        <GuestLists />
      </ProducerGate>
    </main>
  );
}
