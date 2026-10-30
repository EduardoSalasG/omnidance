"use client";

import { useCallback, useEffect, useState, use } from "react";

import { useTranslations } from "next-intl";
import { apiFetch, isTierRequired } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useActorEntitlements } from "@/lib/entitlements-context";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { showActionNotice } from "@/components/ui/action-notice";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { TierPaywall } from "@/components/tier-paywall";
import {
  STAFF_ROLES,
  inputCls,
  readError,
  type EventDetail,
  type StaffRole,
} from "@/components/producer/shared";
import { useRouter } from "@/i18n/navigation";

type EventState = "loading" | "ok" | "notFound" | "error";
type Candidate = { id: string; name: string | null; email: string | null };

/**
 * /productor/eventos/[id]/staff/nuevo - alta de staff de puerta
 * (POST /events/:id/staff upsert por personId). Los toggles de rol/estado
 * por fila quedan en el detalle del evento (acción por fila).
 * Multi-staff es feature del plan del productor: si su entitlement no
 * la cubre (o el POST responde 403 tier.required) se muestra el paywall.
 */
function NewEventStaff({ eventId }: { eventId: string }) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();
  const { me } = useMe();
  const producerEnt = useActorEntitlements("PRODUCER");

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [eventState, setEventState] = useState<EventState>("loading");
  const [eventNonce, setEventNonce] = useState(0);

  // El alta es por nombre: /events/:id/staff/candidates?q= solo devuelve
  // la nómina histórica del productor (no un directorio global); el
  // personId viaja en el POST pero nunca se tipea.
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  // Fallo de la búsqueda: distinto de "sin resultados" (una vacía
  // ambigua escondería un error de red).
  const [searchError, setSearchError] = useState(false);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [role, setRole] = useState<StaffRole>("DOOR");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Lock detectado en el POST (403 tier.required) - complementa el
  // gateo proactivo por si los entitlements quedaron stale.
  const [serverLocked, setServerLocked] = useState(false);

  const backHref = `/productor/eventos/${eventId}`;

  // Nombre del evento para el back link + producerId para el gateo Pro.
  const loadEvent = useCallback(async () => {
    setEventState("loading");
    try {
      const res = await apiFetch(`/events/${eventId}`);
      if (res.status === 404) {
        setEventState("notFound");
        return;
      }
      if (!res.ok) {
        setEventState("error");
        return;
      }
      setEvent((await res.json()) as EventDetail);
      setEventState("ok");
    } catch {
      setEventState("error");
    }
  }, [eventId]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent, eventNonce]);

  // Búsqueda con debounce: solo corre con ≥2 chars y sin selección hecha.
  useEffect(() => {
    const term = query.trim();
    if (selected || term.length < 2) {
      setCandidates(null);
      setSearching(false);
      setSearchError(false);
      return;
    }
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(() => {
      apiFetch(
        `/events/${eventId}/staff/candidates?q=${encodeURIComponent(term)}`,
      )
        .then(async (res) => {
          if (res.ok) {
            setCandidates(await res.json());
          } else {
            setCandidates([]);
            setSearchError(true);
          }
        })
        .catch(() => {
          setCandidates([]);
          setSearchError(true);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, eventId, selected]);

  // requireProSelf: el gateo aplica solo cuando el caller ES el dueño.
  const locked =
    serverLocked ||
    (event != null &&
      event.producerId === me?.id &&
      !producerEnt.loading &&
      !producerEnt.has("multiStaff"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: selected!.id, role }),
      });
      if (!res.ok) {
        if (await isTierRequired(res)) {
          setServerLocked(true);
          return;
        }
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      showActionNotice({ text: t("staffAdded") });
      router.push(backHref);
    } catch {
      setFormError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ConsoleHeader
        backHref={backHref}
        backLabel={event?.name ?? t("sections.staff")}
      />

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold leading-tight">
          {t("staffSection.add")}
        </h2>

        {eventState === "loading" && <SkeletonCard lines={2} />}

        {eventState === "notFound" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/70">{t("eventNotFound")}</p>
            <Button href="/productor/eventos" variant="secondary" size="sm">
              {t("myEvents")}
            </Button>
          </div>
        )}

        {eventState === "error" && (
          <div className="flex items-center gap-3">
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEventNonce((n) => n + 1)}
            >
              <RefreshIcon /> {tc("retry")}
            </Button>
          </div>
        )}

        {eventState === "ok" &&
          (locked ? (
            <TierPaywall actorType="PRODUCER" feature="staff" />
          ) : (
            <Card>
              <form onSubmit={submit} className="flex flex-col gap-4">
                {selected ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/15 bg-canvas px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {selected.name ?? selected.email ?? selected.id}
                      </p>
                      {selected.name && selected.email && (
                        <p className="truncate text-xs text-ink/50">
                          {selected.email}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(null);
                        setQuery("");
                      }}
                      className="min-h-9 shrink-0 rounded px-2 text-xs text-neon hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                    >
                      {t("staffSection.change")}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm text-ink/70">
                        {t("staffSection.personName")}
                        <span aria-hidden="true" className="text-neon">
                          {" "}
                          *
                        </span>
                      </span>
                      <input
                        type="text"
                        required
                        autoComplete="off"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("staffSection.personPlaceholder")}
                        className={inputCls}
                      />
                    </label>
                    <div aria-live="polite">
                      {searching && (
                        <p role="status" className="text-xs text-ink/50">
                          {tc("loading")}
                        </p>
                      )}
                      {searchError && (
                        <p role="alert" className="text-xs text-red-400">
                          {tc("error")}
                        </p>
                      )}
                      {!searchError &&
                        candidates !== null &&
                        candidates.length === 0 && (
                          <p role="status" className="text-xs text-ink/50">
                            {t("staffSection.noResults")}
                          </p>
                        )}
                    </div>
                    {candidates !== null && candidates.length > 0 && (
                      <ul className="flex flex-col gap-1" role="listbox">
                        {candidates.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelected(c);
                                setCandidates(null);
                              }}
                              className="flex min-h-11 w-full flex-col justify-center rounded-lg border border-ink/10 bg-canvas px-3 py-2 text-left hover:border-neon/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                            >
                              <span className="truncate text-sm font-medium">
                                {c.name ?? c.email ?? c.id}
                              </span>
                              {c.name && c.email && (
                                <span className="truncate text-xs text-ink/50">
                                  {c.email}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">
                    {t("staffSection.role")}
                  </span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as StaffRole)}
                    className={inputCls}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`staffSection.roles.${r}`)}
                      </option>
                    ))}
                  </select>
                </label>

                {formError && (
                  <p role="alert" className="text-sm text-red-400">
                    {formError}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={!selected || busy}
                >
                  {busy ? tc("loading") : t("staffSection.add")}
                </Button>
              </form>
            </Card>
          ))}
      </section>
    </>
  );
}

export default function NewEventStaffPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <NewEventStaff eventId={params.id} />
      </ProducerGate>
    </main>
  );
}
