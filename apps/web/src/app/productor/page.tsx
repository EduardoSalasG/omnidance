"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, PriceTag } from "@/components/ui";

// Roles que habilitan la consola (espejo de ProducerGuard / ProducerStaffGuard).
const PRODUCER_ROLES = new Set(["PRODUCER", "ADMIN"]);

// Enum cerrado del dominio (DISCOUNT_CODE_TYPES en apps/api) — no libre.
const CODE_TYPES = [
  "CUMPLEANOS",
  "CORTESIA",
  "CASO_BORDE_PUERTA",
  "CAMPAIGN",
  "WINBACK",
  "STAFF_COMP",
] as const;

type EventOption = {
  id: string;
  name: string;
  startsAt: string;
  series: { name: string } | null;
};

type DiscountCode = {
  id: string;
  code: string;
  type: string;
  eventId: string | null;
  seriesId: string | null;
  percentOff: number | null;
  amountOff: number | null;
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  createdAt: string;
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

type Gate = "loading" | "unauth" | "notProducer" | "error" | "ready";

const fmtDay = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" });

const inputCls =
  "min-h-12 w-full rounded-xl border border-night-700 bg-night-950 px-4 py-3 " +
  "text-white outline-none focus:border-neon disabled:opacity-50";

export default function ProducerPage() {
  const t = useTranslations("producer");
  const ta = useTranslations("admin");
  const te = useTranslations("events");
  const tac = useTranslations("academy");
  const tc = useTranslations("common");

  const [gate, setGate] = useState<Gate>("loading");
  const [meId, setMeId] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);

  // --- Códigos de descuento ---
  const [codes, setCodes] = useState<DiscountCode[] | null>(null);
  const [codesError, setCodesError] = useState(false);
  const [showCodeForm, setShowCodeForm] = useState(false);
  const [codeForm, setCodeForm] = useState({
    code: "",
    type: CODE_TYPES[0] as string,
    percentOff: "",
    amountOff: "",
    maxUses: "",
    expiresAt: "",
    eventId: "",
  });
  const [codeSaving, setCodeSaving] = useState(false);
  const [codeFormError, setCodeFormError] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  // --- Listas de invitados ---
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

  const loadCodes = useCallback(async () => {
    setCodesError(false);
    try {
      const res = await apiFetch("/discount-codes");
      if (!res.ok) {
        setCodesError(true);
        return;
      }
      setCodes((await res.json()) as DiscountCode[]);
    } catch {
      setCodesError(true);
    }
  }, []);

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
      setMeId(data.id);

      // Eventos para selects + listado de códigos en paralelo.
      const [evRes] = await Promise.all([apiFetch("/events"), loadCodes()]);
      if (evRes.ok) {
        const evs = (await evRes.json()) as EventOption[];
        setEvents(evs);
        if (evs.length > 0) {
          setListEventId(evs[0].id);
          void loadLists(evs[0].id);
        }
      }
      setGate("ready");
    } catch {
      setGate("error");
    }
  }, [loadCodes, loadLists]);

  useEffect(() => {
    void boot();
  }, [boot]);

  // percentOff XOR amountOff: se deshabilita el input contrario cuando hay valor.
  const percent = codeForm.percentOff === "" ? null : Number(codeForm.percentOff);
  const amount = codeForm.amountOff === "" ? null : Number(codeForm.amountOff);
  const discountValid =
    (percent !== null && percent >= 1 && percent <= 100) !==
    (amount !== null && amount >= 1);
  const codeValid = codeForm.code.trim() !== "" && discountValid;

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!codeValid || codeSaving) return;
    setCodeSaving(true);
    setCodeFormError(false);
    try {
      const res = await apiFetch("/discount-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: codeForm.code.trim(),
          type: codeForm.type,
          ...(percent !== null ? { percentOff: percent } : {}),
          ...(amount !== null ? { amountOff: amount } : {}),
          ...(codeForm.maxUses !== ""
            ? { maxUses: Number(codeForm.maxUses) }
            : {}),
          ...(codeForm.expiresAt !== ""
            ? { expiresAt: new Date(codeForm.expiresAt).toISOString() }
            : {}),
          ...(codeForm.eventId !== "" ? { eventId: codeForm.eventId } : {}),
        }),
      });
      if (!res.ok) {
        setCodeFormError(true);
        return;
      }
      const created = (await res.json()) as { id: string };
      setJustCreatedId(created.id);
      setCodeForm({
        code: "",
        type: CODE_TYPES[0],
        percentOff: "",
        amountOff: "",
        maxUses: "",
        expiresAt: "",
        eventId: "",
      });
      setShowCodeForm(false);
      await loadCodes();
    } catch {
      setCodeFormError(true);
    } finally {
      setCodeSaving(false);
    }
  }

  async function submitList(e: React.FormEvent) {
    e.preventDefault();
    if (!listName.trim() || !listEventId || listSaving) return;
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

  const eventName = (id: string | null) =>
    id ? (events.find((e) => e.id === id)?.name ?? null) : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {gate === "loading" && <p className="text-white/60">{tc("loading")}</p>}

      {gate === "unauth" && (
        <Button href="/login" size="lg" className="self-start">
          {tc("login")}
        </Button>
      )}

      {gate === "notProducer" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{t("notProducer")}</p>
          <Button href="/" variant="secondary">
            {tc("appName")}
          </Button>
        </div>
      )}

      {gate === "error" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-white/70">{tc("error")}</p>
          <Button variant="secondary" onClick={() => void boot()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}

      {gate === "ready" && (
        <>
          {/* ---------- Códigos de descuento ---------- */}
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
                {t("discountCodes")}
              </h2>
              <Button
                size="sm"
                variant={showCodeForm ? "ghost" : "secondary"}
                onClick={() => setShowCodeForm((v) => !v)}
              >
                {showCodeForm ? tc("cancel") : `＋ ${t("newCode")}`}
              </Button>
            </div>

            {showCodeForm && (
              <Card>
                <form onSubmit={submitCode} className="flex flex-col gap-4">
                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-white/70">{t("code")}</span>
                    <input
                      type="text"
                      required
                      autoComplete="off"
                      value={codeForm.code}
                      onChange={(e) =>
                        setCodeForm((f) => ({ ...f, code: e.target.value }))
                      }
                      className={`${inputCls} uppercase`}
                    />
                  </label>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-white/70">{t("type")}</span>
                    <select
                      value={codeForm.type}
                      onChange={(e) =>
                        setCodeForm((f) => ({ ...f, type: e.target.value }))
                      }
                      className={inputCls}
                    >
                      {CODE_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {t.has(`types.${ct}`) ? t(`types.${ct}`) : ct}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm text-white/70">
                        {t("percentOff")}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        disabled={codeForm.amountOff !== ""}
                        value={codeForm.percentOff}
                        onChange={(e) =>
                          setCodeForm((f) => ({
                            ...f,
                            percentOff: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm text-white/70">
                        {t("amountOff")}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        disabled={codeForm.percentOff !== ""}
                        value={codeForm.amountOff}
                        onChange={(e) =>
                          setCodeForm((f) => ({
                            ...f,
                            amountOff: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm text-white/70">
                        {t("maxUses")}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={codeForm.maxUses}
                        onChange={(e) =>
                          setCodeForm((f) => ({
                            ...f,
                            maxUses: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-sm text-white/70">
                        {t("expiresAt")}
                      </span>
                      <input
                        type="date"
                        value={codeForm.expiresAt}
                        onChange={(e) =>
                          setCodeForm((f) => ({
                            ...f,
                            expiresAt: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </label>
                  </div>

                  <label className="flex flex-col gap-2">
                    <span className="text-sm text-white/70">{te("title")}</span>
                    <select
                      value={codeForm.eventId}
                      onChange={(e) =>
                        setCodeForm((f) => ({ ...f, eventId: e.target.value }))
                      }
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {codeFormError && (
                    <p role="alert" className="text-sm text-red-400">
                      {tc("error")}
                    </p>
                  )}

                  <Button type="submit" disabled={!codeValid || codeSaving}>
                    {codeSaving ? `${tc("loading")}` : tc("create")}
                  </Button>
                </form>
              </Card>
            )}

            {codes === null && !codesError && (
              <p className="text-white/60">{tc("loading")}</p>
            )}
            {codesError && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-red-400">{tc("error")}</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void loadCodes()}
                >
                  ↻ {tc("retry")}
                </Button>
              </div>
            )}
            {codes !== null && codes.length === 0 && (
              <p className="text-white/60">{t("empty")}</p>
            )}
            {codes !== null && codes.length > 0 && (
              <ul className="flex flex-col gap-3">
                {codes.map((c) => (
                  <li key={c.id}>
                    <Card
                      className={`flex flex-col gap-2 ${
                        c.id === justCreatedId ? "border-neon" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-lg font-bold tracking-wide">
                          {c.code}
                        </span>
                        <Badge variant="neon">
                          {t.has(`types.${c.type}`)
                            ? t(`types.${c.type}`)
                            : c.type}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/70">
                        <span>
                          {c.percentOff !== null ? (
                            <span className="font-semibold text-neon">
                              −{c.percentOff}%
                            </span>
                          ) : (
                            <PriceTag amount={c.amountOff} />
                          )}
                        </span>
                        <span>
                          {t("usedCount")}: {c.usedCount}
                          {c.maxUses !== null ? `/${c.maxUses}` : ""}
                        </span>
                        {c.expiresAt && (
                          <span>
                            {t("expiresAt")}:{" "}
                            {fmtDay.format(new Date(c.expiresAt))}
                          </span>
                        )}
                        {eventName(c.eventId) && (
                          <span className="text-white/50">
                            {eventName(c.eventId)}
                          </span>
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Listas de invitados ---------- */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
              {t("guestLists")}
            </h2>

            {events.length === 0 ? (
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

                {listsLoading && (
                  <p className="text-white/60">{tc("loading")}</p>
                )}
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
      )}
    </main>
  );
}
