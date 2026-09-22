"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";
import type { Me } from "@/components/social/types";

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

const chipCls = (active: boolean) =>
  `min-h-11 rounded-full border px-5 text-sm font-medium transition-colors active:scale-[0.97] ` +
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon ${
    active
      ? "border-neon bg-neon/15 text-neon"
      : "border-white/15 text-white/60 hover:border-white/30 hover:text-white"
  }`;

/**
 * Nueva práctica (spec §8): micro-evento creado por cualquier bailarín —
 * gratis, first-come, check-in por QR. Lugar = dirección libre (parque,
 * plaza o studio); "quiénes pueden asistir" se traduce a womenOnly/menOnly.
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
  // Dirección libre — parque, plaza o studio; sin catálogo de venues.
  // venueNotes = detalle del lugar (sala, piso, punto exacto).
  const [address, setAddress] = useState("");
  const [venueNotes, setVenueNotes] = useState("");
  const [description, setDescription] = useState("");
  // Asistencia: ambos activos por defecto ("todxs"); solo-mujeres →
  // womenOnly, solo-hombres → menOnly. Al menos uno debe quedar activo.
  const [allowMen, setAllowMen] = useState(true);
  const [allowWomen, setAllowWomen] = useState(true);
  const [styleId, setStyleId] = useState("");
  const [styles, setStyles] = useState<{ id: string; name: string }[]>([]);
  const [capacity, setCapacity] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    apiFetch("/me")
      .then(async (res) => setMe(res.ok ? ((await res.json()) as Me) : null))
      .catch(() => setMe(null));
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
    if (submitting || !allowMen && !allowWomen) return;
    setSubmitting(true);
    setFormError(false);
    try {
      const start = new Date(`${date}T${startTime}`);
      // Si "hasta" queda antes de "desde", la práctica cruza la medianoche.
      let end = new Date(`${date}T${endTime}`);
      if (end <= start) end = new Date(end.getTime() + 24 * 3600 * 1000);
      const res = await apiFetch("/practices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ...(address.trim() ? { venueText: address.trim() } : {}),
          ...(venueNotes.trim() ? { venueNotes: venueNotes.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(allowWomen && !allowMen ? { womenOnly: true } : {}),
          ...(allowMen && !allowWomen ? { menOnly: true } : {}),
          ...(styleId ? { style: styleId } : {}),
          ...(capacity ? { capacity: parseInt(capacity, 10) } : {}),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
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

  const minDate = new Date(
    Date.now() - new Date().getTimezoneOffset() * 60_000,
  )
    .toISOString()
    .slice(0, 10);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6">
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

          {/* Dirección + notas del lugar — el "dónde" en un solo bloque */}
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("address")}</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("addressPlaceholder")}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("addressNotes")}</span>
              <input
                value={venueNotes}
                onChange={(e) => setVenueNotes(e.target.value)}
                placeholder={t("addressNotesPlaceholder")}
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

          {/* Asistencia — multi-select Hombres/Mujeres; ambos = todxs */}
          <fieldset className="flex flex-col text-sm">
            <legend className="text-white/70">{t("audience")}</legend>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                aria-pressed={allowMen}
                aria-disabled={allowMen && !allowWomen}
                onClick={() => setAllowMen((v) => (v && !allowWomen ? v : !v))}
                className={chipCls(allowMen)}
              >
                {t("audienceMen")}
              </button>
              <button
                type="button"
                aria-pressed={allowWomen}
                aria-disabled={allowWomen && !allowMen}
                onClick={() => setAllowWomen((v) => (v && !allowMen ? v : !v))}
                className={chipCls(allowWomen)}
              >
                {t("audienceWomen")}
              </button>
            </div>
          </fieldset>

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
                {t("date")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("startTime")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">
                {t("endTime")}
                <span aria-hidden="true" className="text-neon"> *</span>
              </span>
              <input
                required
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-400">
              {tc("error")}
            </p>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? tc("loading") : tc("create")}
          </Button>
        </form>
      )}
    </main>
  );
}
