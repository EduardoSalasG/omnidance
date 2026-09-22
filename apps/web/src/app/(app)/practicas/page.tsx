"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import { AvailabilitySection } from "@/components/social/AvailabilitySection";
import { PartnerRequests } from "@/components/social/PartnerRequests";
import type { Me } from "@/components/social/types";

// GET /practices — shape público de evento + host resuelto.
type Practice = {
  id: string;
  name: string;
  type: string;
  status: string;
  hostId: string | null;
  host: { id: string; name: string | null } | null;
  capacity: number | null;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  series: { name: string } | null;
  venue: { name: string; address: string | null } | null;
  venueText: string | null;
  womenOnly: boolean;
  rsvpCount: number;
  style: { id: string; name: string } | null;
};

/** GET /venues (público) — alimenta el select del formulario. */
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
const CREATED_FEEDBACK_MS = 4000;

export default function PracticasPage() {
  const t = useTranslations("practices");
  const te = useTranslations("events");
  const tc = useTranslations("common");

  const [state, setState] = useState<ListState>("loading");
  const [practices, setPractices] = useState<Practice[]>([]);
  // undefined = cargando; null = sin sesión. Alimenta el formulario y las
  // secciones sociales (disponibles / busco pareja).
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(false);
  const [formError, setFormError] = useState(false);
  const createdTimer = useRef<number | null>(null);

  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  // Estilo foco y cupos — la spec pide aforo chico (~8-15) y género foco;
  // el DTO del API ya acepta ambos.
  const [styleId, setStyleId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [styles, setStyles] = useState<{ id: string; name: string }[]>([]);
  // venueText = nombre libre del parque/plaza (cuando no hay Venue del
  // catálogo); womenOnly = señal safety de la spec §8.
  const [venueText, setVenueText] = useState("");
  const [womenOnly, setWomenOnly] = useState(false);

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
    // Sesión: habilita el formulario de creación y las secciones sociales
    // (la lista de prácticas es pública).
    apiFetch("/me")
      .then(async (res) => setMe(res.ok ? ((await res.json()) as Me) : null))
      .catch(() => setMe(null));
    // Venues para el select (público). Si falla, queda solo "otro lugar".
    apiFetch("/venues")
      .then(async (res) => {
        if (res.ok) setVenues((await res.json()) as Venue[]);
      })
      .catch(() => {});
    // Catálogo de estilos para el foco de la práctica (público, ~10 filas).
    apiFetch("/styles")
      .then(async (res) => {
        if (res.ok)
          setStyles((await res.json()) as { id: string; name: string }[]);
      })
      .catch(() => {});
    return () => {
      if (createdTimer.current) window.clearTimeout(createdTimer.current);
    };
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
        // venueId vacío = "otro lugar" (parque/plaza) — el API lo acepta como null.
        body: JSON.stringify({
          name,
          ...(venueId ? { venueId } : {}),
          ...(!venueId && venueText.trim()
            ? { venueText: venueText.trim() }
            : {}),
          ...(womenOnly ? { womenOnly: true } : {}),
          ...(styleId ? { style: styleId } : {}),
          ...(capacity ? { capacity: parseInt(capacity, 10) } : {}),
          startsAt: start.toISOString(),
          endsAt: new Date(start.getTime() + PRACTICE_DURATION_MS).toISOString(),
        }),
      });
      if (res.status === 401) {
        setMe(null);
        return;
      }
      if (!res.ok) {
        setFormError(true);
        return;
      }
      setCreated(true);
      if (createdTimer.current) window.clearTimeout(createdTimer.current);
      createdTimer.current = window.setTimeout(
        () => setCreated(false),
        CREATED_FEEDBACK_MS,
      );
      setFormOpen(false);
      setName("");
      setVenueId("");
      setStartsAt("");
      setStyleId("");
      setCapacity("");
      setVenueText("");
      setWomenOnly(false);
      await load();
    } catch {
      setFormError(true);
    } finally {
      setSubmitting(false);
    }
  }

  // datetime-local exige hora local (no UTC) en formato YYYY-MM-DDTHH:mm.
  const minStartsAt = new Date(
    Date.now() - new Date().getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 16);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
      <h1 className="sr-only">{t("title")}</h1>
      {/* Próximas prácticas — heading + crear, mismo patrón que
          "Busco pareja" */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
            {t("upcoming")}
          </h2>
          {!!me && !formOpen && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              {t("create")}
            </Button>
          )}
        </div>

        {/* Confirmación transitoria — desaparece sola */}
        {created && (
          <p
            role="status"
            className="rounded-xl border border-neon/40 bg-neon/10 px-4 py-2.5 text-sm font-medium text-neon"
          >
            {t("created")}
          </p>
        )}

        {/* Crear práctica — requiere sesión */}
        {me === null && (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/60">{t("loginRequired")}</p>
            <Button href="/login" size="sm">
              {tc("login")}
            </Button>
          </Card>
        )}
        {!!me && formOpen && (
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
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">{t("venue")}</span>
                <select
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t("venueOther")}</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
              {/* "Otro lugar" → nombre libre del parque/plaza */}
              {!venueId && (
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-white/70">{t("venueName")}</span>
                  <input
                    value={venueText}
                    onChange={(e) => setVenueText(e.target.value)}
                    placeholder={t("venuePlaceholder")}
                    className={inputCls}
                  />
                </label>
              )}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={womenOnly}
                  onChange={(e) => setWomenOnly(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
                />
                <span className="text-white/70">{t("womenOnly")}</span>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">{t("style")}</span>
                <select
                  value={styleId}
                  onChange={(e) => setStyleId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">{t("styleAny")}</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">{t("capacityLabel")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={60}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder={t("capacityPlaceholder")}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-white/70">
                  {t("startsAt")}
                  <span aria-hidden="true" className="text-neon"> *</span>
                </span>
                <input
                  required
                  type="datetime-local"
                  min={minStartsAt}
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
        {state === "loading" && <PageLoading />}
        {state === "error" && (
          <p role="alert" className="text-white/60">
            {tc("error")}
          </p>
        )}
        {state === "ready" &&
          (practices.length === 0 ? (
            <Card className="flex flex-col items-start gap-3">
              <p role="status" className="text-white/60">
                {t("empty")}
              </p>
              {/* Sin dead-end: organizar la primera práctica es la acción
                  que la spec gamifica (badge "organizador de prácticas") */}
              {!!me && !formOpen && (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  {t("create")}
                </Button>
              )}
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {practices.map((p) => {
                const mine = me != null && p.hostId === me.id;
                return (
                  <li key={p.id}>
                    <Link href={`/eventos/${p.id}`} className="block">
                      <Card className="transition-colors hover:border-neon/50">
                        <div className="flex flex-wrap items-center gap-2">
                          {p.status === "LIVE" && (
                            <Badge variant="live">{te("live")}</Badge>
                          )}
                          {p.style && (
                            <Badge variant="neon">{p.style.name}</Badge>
                          )}
                          {mine && (
                            <Badge variant="neon">{t("yours")}</Badge>
                          )}
                          {p.womenOnly && (
                            <Badge variant="muted">{t("womenOnly")}</Badge>
                          )}
                          {p.capacity != null && (
                            <Badge variant="outline">
                              {t("capacity", { count: p.capacity })}
                            </Badge>
                          )}
                          {p.rsvpCount > 0 && (
                            <Badge variant="muted">
                              {t("goingCount", { count: p.rsvpCount })}
                            </Badge>
                          )}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold">{p.name}</h3>
                        <p className="text-sm text-white/60">
                          <EventDate start={p.startsAt} end={p.endsAt} />
                          {p.venue
                            ? ` · ${p.venue.name}`
                            : p.venueText
                              ? ` · ${p.venueText}`
                              : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-white/50">
                          {[
                            p.venue?.address,
                            p.host?.name && !mine
                              ? t("hostedBy", { name: p.host.name })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ))}
      </section>

      {/* Encontrar con quién — disponibilidad y búsqueda de pareja */}
      <section className="flex flex-col gap-5 border-t border-night-800 pt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          {t("findPartner")}
        </h2>
        <AvailabilitySection me={me} />
        <PartnerRequests me={me} />
      </section>
    </main>
  );
}
