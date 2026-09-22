"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type { Me } from "@/components/social/types";

/** GET /venues (público) — alimenta el select del formulario. */
type Venue = {
  id: string;
  name: string;
};

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

/** Duración por defecto de una práctica (el DTO exige endsAt; sin input propio). */
const PRACTICE_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * Nueva práctica (spec §8): micro-evento creado por cualquier bailarín —
 * gratis, first-come, check-in por QR. Vive en página propia: el listado
 * (/practicas) queda solo para descubrir y coordinar.
 * Al crear, redirige al detalle público de la práctica.
 */
export default function NuevaPracticaPage() {
  const t = useTranslations("practices");
  const tc = useTranslations("common");
  const router = useRouter();

  // undefined = cargando; null = sin sesión.
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(false);

  const [name, setName] = useState("");
  const [venueId, setVenueId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [styleId, setStyleId] = useState("");
  const [capacity, setCapacity] = useState("");
  const [styles, setStyles] = useState<{ id: string; name: string }[]>([]);
  // venueText = nombre libre del parque/plaza (cuando no hay Venue del
  // catálogo); womenOnly = señal safety de la spec §8.
  const [venueText, setVenueText] = useState("");
  const [womenOnly, setWomenOnly] = useState(false);
  const [description, setDescription] = useState("");

  useEffect(() => {
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
  }, []);

  async function createPractice(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(false);
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
          ...(description.trim()
            ? { description: description.trim() }
            : {}),
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
      const created = (await res.json()) as { id: string };
      // Directo al detalle: la práctica recién creada ya vive como evento.
      router.push(`/eventos/${created.id}`);
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
      <h1 className="text-2xl font-bold leading-tight">{t("new")}</h1>

      {me === undefined && <PageLoading />}
      {me === null && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/60">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      )}

      {!!me && (
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
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-white/70">{t("description")}</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
              className={`${inputCls} resize-none`}
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
            <Button href="/practicas" variant="ghost">
              {tc("cancel")}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
