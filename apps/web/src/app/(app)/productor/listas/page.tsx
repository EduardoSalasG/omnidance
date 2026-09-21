"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";

type EventOption = {
  id: string;
  name: string;
  startsAt: string;
  series: { name: string } | null;
};

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

const inputCls =
  "min-h-12 w-full rounded-xl border border-night-700 bg-night-950 px-4 py-3 " +
  "text-white focus:border-neon focus-visible:ring-2 focus-visible:ring-neon/50 disabled:opacity-50";

/**
 * /productor/listas — listas de invitados por evento
 * (GET /events, GET/POST /events/:id/guest-lists, POST /guest-lists/:id/entries).
 * Monta solo cuando ProducerGate confirma rol.
 */
function GuestLists() {
  const t = useTranslations("producer");
  const ta = useTranslations("admin");
  const te = useTranslations("events");
  const tac = useTranslations("academy");
  const tc = useTranslations("common");

  const [meId, setMeId] = useState("");
  const [events, setEvents] = useState<EventOption[] | null>(null);

  const [listEventId, setListEventId] = useState("");
  const [lists, setLists] = useState<GuestList[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [listsError, setListsError] = useState(false);
  const [showListForm, setShowListForm] = useState(false);
  const [listName, setListName] = useState("");
  const [listSaving, setListSaving] = useState(false);
  const [entryDrafts, setEntryDrafts] = useState<Record<string, string>>({});
  const [entrySaving, setEntrySaving] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);

  const loadLists = useCallback(async (eventId: string) => {
    if (!eventId) {
      setLists(null);
      return;
    }
    setListsLoading(true);
    setListsError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/guest-lists`);
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
    // /me para ownerId de nuevas listas + eventos para el selector.
    const [meRes, evRes] = await Promise.all([
      apiFetch("/me"),
      apiFetch("/events"),
    ]);
    if (meRes.ok) {
      const me = (await meRes.json()) as { id: string };
      setMeId(me.id);
    }
    if (evRes.ok) {
      const evs = (await evRes.json()) as EventOption[];
      setEvents(evs);
      if (evs.length > 0) {
        setListEventId(evs[0].id);
        void loadLists(evs[0].id);
      }
    } else {
      setEvents([]);
    }
  }, [loadLists]);

  useEffect(() => {
    void boot();
  }, [boot]);

  async function submitList(e: React.FormEvent) {
    e.preventDefault();
    if (!listName.trim() || !listEventId || !meId || listSaving) return;
    setListSaving(true);
    try {
      const res = await apiFetch(`/events/${listEventId}/guest-lists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // v1: la lista queda a nombre del productor logueado (ownerId requerido).
        body: JSON.stringify({ ownerId: meId, label: listName.trim() }),
      });
      if (!res.ok) return;
      setListName("");
      setShowListForm(false);
      await loadLists(listEventId);
    } catch {
      // El estado de la lista se refleja en el próximo refetch
    } finally {
      setListSaving(false);
    }
  }

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
      await loadLists(listEventId);
    } catch {
      setEntryError(listId);
    } finally {
      setEntrySaving(null);
    }
  }

  return (
    <>
      <ConsoleHeader backHref="/productor" backLabel={t("title")} />

      <section className="flex flex-col gap-4">
        {events === null ? (
          <Spinner size="sm" />
        ) : events.length === 0 ? (
          <p className="text-white/60">{te("empty")}</p>
        ) : (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-white/70">{te("title")}</span>
              <select
                value={listEventId}
                onChange={(e) => {
                  setListEventId(e.target.value);
                  void loadLists(e.target.value);
                }}
                className={inputCls}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-end">
              <Button
                size="sm"
                variant={showListForm ? "ghost" : "secondary"}
                onClick={() => setShowListForm((v) => !v)}
              >
                {showListForm ? tc("cancel") : `＋ ${t("newList")}`}
              </Button>
            </div>

            {showListForm && (
              <Card>
                <form onSubmit={submitList} className="flex flex-col gap-4">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-white/70">
                      {t("listName")}
                      <span aria-hidden="true" className="text-neon"> *</span>
                    </span>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={listName}
                      onChange={(e) => setListName(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={!listName.trim() || listSaving}
                  >
                    {listSaving ? tc("loading") : tc("create")}
                  </Button>
                </form>
              </Card>
            )}

            {listsLoading && <Spinner size="sm" />}
            {listsError && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-400">{tc("error")}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadLists(listEventId)}
                >
                  ↻ {tc("retry")}
                </Button>
              </div>
            )}
            {!listsLoading && !listsError && lists !== null && (
              <ul className="flex flex-col gap-3">
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
                        <ul className="flex flex-col gap-1.5 border-t border-night-700 pt-3">
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
                        className="flex gap-2 border-t border-night-700 pt-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void addEntry(l.id);
                        }}
                      >
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder={tac("personId")}
                          aria-label={`${t("addPerson")} — ${l.label ?? l.owner.name}`}
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
      </section>
    </>
  );
}

export default function ProducerListsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <ProducerGate>
        <GuestLists />
      </ProducerGate>
    </main>
  );
}
