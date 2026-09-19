"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, EventDate } from "@/components/ui";
import { TripMatches } from "@/components/social/trip-matches";

// Shape de Trip según trips.controller (prisma.trip)
type Trip = {
  id: string;
  personId: string;
  destination: string;
  eventId: string | null;
  startsAt: string;
  endsAt: string;
};

type PageState = "loading" | "ready" | "unauth" | "error";

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

export default function ViajesPage() {
  const t = useTranslations("trips");
  const tc = useTranslations("common");

  const [state, setState] = useState<PageState>("loading");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(false);

  const [city, setCity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/trips/mine");
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (!res.ok) {
        setState("error");
        return;
      }
      setTrips((await res.json()) as Trip[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addTrip(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(false);
    try {
      const res = await apiFetch("/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // CreateTripDto: city (→ destination), startsAt, endsAt, eventId?
        body: JSON.stringify({
          city,
          startsAt: new Date(startDate).toISOString(),
          endsAt: new Date(endDate).toISOString(),
        }),
      });
      if (res.status === 401) {
        setState("unauth");
        return;
      }
      if (!res.ok) {
        setFormError(true);
        return;
      }
      setFormOpen(false);
      setCity("");
      setStartDate("");
      setEndDate("");
      await load();
    } catch {
      setFormError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "unauth") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <p className="text-white/60">{t("loginRequired")}</p>
        <Button href="/login">{tc("login")}</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-end gap-4">
        {state === "ready" && !formOpen && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t("add")}
          </Button>
        )}
      </div>

      {formOpen && (
        <Card>
          <form onSubmit={addTrip} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("destination")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputCls}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">
                  {t("from")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">
                  {t("until")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  required
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            {formError && (
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? tc("loading") : tc("save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFormOpen(false)}
              >
                {tc("cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {state === "loading" && (
        <p role="status" className="text-white/50">
          {tc("loading")}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="text-white/60">
          {tc("error")}
        </p>
      )}
      {state === "ready" &&
        (trips.length === 0 ? (
          <Card>
            <p role="status" className="text-white/60">
              {t("empty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Card>
                  <h2 className="text-lg font-semibold">{trip.destination}</h2>
                  <p className="mt-1 text-sm text-white/60">
                    <EventDate start={trip.startsAt} /> →{" "}
                    <EventDate start={trip.endsAt} />
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        ))}

      {/* Coincidencias: carga y errores independientes del resto de la página */}
      {state === "ready" && <TripMatches trips={trips} />}
    </main>
  );
}
