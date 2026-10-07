"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch, isProRequired } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card, RefreshIcon, SkeletonCard } from "@/components/ui";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ProPaywall } from "@/components/producer/pro-paywall";
import {
  STAFF_ROLES,
  inputCls,
  readError,
  type EventDetail,
  type StaffRole,
} from "@/components/producer/shared";

type EventState = "loading" | "ok" | "notFound" | "error";

/**
 * /productor/eventos/[id]/staff/nuevo - alta de staff de puerta
 * (POST /events/:id/staff upsert por personId). Los toggles de rol/estado
 * por fila quedan en el detalle del evento (acción por fila).
 * Multi-staff es feature Producer Pro: si /me dice que el owner no tiene
 * Pro (o el POST responde 403 pro.required) se muestra el paywall.
 */
function NewEventStaff({ eventId }: { eventId: string }) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");
  const router = useRouter();
  const { me } = useMe();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [eventState, setEventState] = useState<EventState>("loading");
  const [eventNonce, setEventNonce] = useState(0);

  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<StaffRole>("DOOR");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Lock detectado en el POST (403 pro.required) - complementa el gateo
  // proactivo por si /me quedó stale.
  const [serverLocked, setServerLocked] = useState(false);
  const [added, setAdded] = useState(false);

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

  // requireProSelf: el gateo aplica solo cuando el caller ES el dueño.
  const locked =
    serverLocked ||
    (event != null &&
      event.producerId === me?.id &&
      me?.effectivePro === false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!personId.trim() || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/events/${eventId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: personId.trim(), role }),
      });
      if (!res.ok) {
        if (await isProRequired(res)) {
          setServerLocked(true);
          return;
        }
        setFormError((await readError(res)) ?? tc("error"));
        return;
      }
      setAdded(true);
      setTimeout(() => router.push(backHref), 1200);
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
        <h1 className="text-2xl font-bold leading-tight">
          {t("staffSection.add")}
        </h1>

        {added && (
          <Card className="p-6 text-center">
            <p role="status" className="text-lg font-bold text-neon">
              {t("staffAdded")}
            </p>
          </Card>
        )}

        {!added && eventState === "loading" && <SkeletonCard lines={2} />}

        {!added && eventState === "notFound" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-ink/70">{t("eventNotFound")}</p>
            <Button href="/productor/eventos" variant="secondary" size="sm">
              {t("myEvents")}
            </Button>
          </div>
        )}

        {!added && eventState === "error" && (
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

        {!added &&
          eventState === "ok" &&
          (locked ? (
            <ProPaywall />
          ) : (
            <Card>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-sm text-ink/70">
                    {t("staffSection.personId")}
                    <span aria-hidden="true" className="text-neon"> *</span>
                  </span>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    value={personId}
                    onChange={(e) => setPersonId(e.target.value)}
                    className={inputCls}
                  />
                </label>

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
                  disabled={!personId.trim() || busy}
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

export default function NewEventStaffPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-3xl lg:px-8">
      <ProducerGate>
        <NewEventStaff eventId={params.id} />
      </ProducerGate>
    </main>
  );
}
