"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";

// Mismo shape público que GET /events (PracticesController.list)
type Practice = {
  id: string;
  name: string;
  type: string;
  status: string;
  hostId: string | null;
  capacity: number | null;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  series: { name: string } | null;
  venue: { name: string; address: string | null };
};

/** GET /venues (público) — alimenta el datalist del formulario. */
type Venue = {
  id: string;
  name: string;
  address: string | null;
  capacity: number | null;
};

type ListState = "loading" | "ready" | "error";

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

/** Duración por defecto de una práctica (el DTO exige endsAt; sin input propio). */
const PRACTICE_DURATION_MS = 3 * 60 * 60 * 1000;

export default function PracticasPage() {
  const t = useTranslations("practices");
  const te = useTranslations("events");
  const tr = useTranslations("rsvp");
  const tc = useTranslations("common");

  const [state, setState] = useState<ListState>("loading");
  const [practices, setPractices] = useState<Practice[]>([]);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [formError, setFormError] = useState(false);

  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/practices");
      if (!res.ok) {
        setState("error");
        return;
      }
      setPractices((await res.json()) as Practice[]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    // Sesión solo para habilitar el formulario de creación (la lista es pública)
    apiFetch("/me")
      .then((res) => setAuthed(res.ok))
      .catch(() => setAuthed(false));
    // Venues para el datalist (público). Si falla, el input sigue libre.
    apiFetch("/venues")
      .then(async (res) => {
        if (res.ok) setVenues((await res.json()) as Venue[]);
      })
      .catch(() => {});
  }, [load]);

  async function createPractice(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(false);
    setCreated(false);
    try {
      const start = new Date(startsAt);
      const res = await apiFetch("/practices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          venueId,
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + PRACTICE_DURATION_MS).toISOString(),
        }),
      });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (!res.ok) {
        setFormError(true);
        return;
      }
      setCreated(true);
      setFormOpen(false);
      setName("");
      setVenueId("");
      setStartsAt("");
      await load();
    } catch {
      setFormError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-end gap-4">
        {authed && !formOpen && (
          <Button size="sm" onClick={() => setFormOpen(true)}>
            {t("create")}
          </Button>
        )}
      </div>

      {created && (
        <p role="status" className="text-sm font-medium text-neon">
          {t("created")}
        </p>
      )}

      {/* Crear práctica — requiere sesión */}
      {authed === false && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/60">{tr("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      )}
      {authed === true && formOpen && (
        <Card>
          <form onSubmit={createPractice} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("name")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </label>
            {/* Datalist con GET /venues (value=id, label=nombre). Si la API
                falla el input sigue aceptando texto libre como fallback. */}
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("venue")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                list="practice-venues"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                placeholder={t("venuePlaceholder")}
                className={inputCls}
              />
              <datalist id="practice-venues">
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("startsAt")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputCls}
              />
            </label>
            {formError && (
              <p role="alert" className="text-sm text-red-400">
                {tc("error")}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? tc("loading") : tc("create")}
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

      {/* Lista */}
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
        (practices.length === 0 ? (
          <Card>
            <p role="status" className="text-white/60">
              {t("empty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-4">
            {practices.map((p) => (
              <li key={p.id}>
                <Link href={`/eventos/${p.id}`} className="block">
                  <Card className="transition-colors hover:border-neon/50">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neon">{te("type.PRACTICA")}</Badge>
                      {p.status === "LIVE" && (
                        <Badge variant="live">{te("live")}</Badge>
                      )}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">{p.name}</h2>
                    <p className="text-sm text-white/60">
                      <EventDate start={p.startsAt} end={p.endsAt} /> ·{" "}
                      {p.venue.name}
                    </p>
                    {p.venue.address && (
                      <p className="mt-0.5 text-xs text-white/50">
                        {p.venue.address}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </main>
  );
}
