"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { PageLoading } from "@/components/ui/spinner";

const inputCls =
  "min-h-11 w-full min-w-0 rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

/**
 * Nueva práctica (spec §8): micro-evento creado por cualquier bailarín -
 * gratis, first-come, check-in por QR. Lugar = dirección libre (parque,
 * plaza o studio). Al crear, redirige al detalle público de la práctica.
 */
export default function NuevaPracticaPage() {
  const t = useTranslations("practices");
  const tc = useTranslations("common");
  const router = useRouter();

  // /me compartido (MeProvider): loading = en vuelo; null = sin sesión.
  const { me, loading: meLoading, refresh: refreshMe } = useMe();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(false);
  // Éxito breve antes del redirect - la key practices.created existía
  // sin uso; el detalle destino no puede anunciar la creación.
  const [created, setCreated] = useState(false);
  // Fallo de GET /styles - el select quedaría solo con "Cualquiera"
  // sin aviso; la práctica se puede publicar igual sin estilo.
  const [stylesError, setStylesError] = useState(false);

  const [name, setName] = useState("");
  // Dirección libre - parque, plaza o studio; sin catálogo de venues.
  // venueNotes = detalle del lugar (sala, piso, punto exacto).
  const [address, setAddress] = useState("");
  const [venueNotes, setVenueNotes] = useState("");
  const [description, setDescription] = useState("");
  const [styleId, setStyleId] = useState("");
  // null = catálogo en vuelo → el select queda disabled; si apareciera
  // habilitado con solo "Cualquiera", las options entrarían de golpe
  // (y un cambio temprano quedaría contra un catálogo incompleto).
  const [styles, setStyles] = useState<{ id: string; name: string }[] | null>(
    null,
  );
  const [capacity, setCapacity] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    // Catálogo de estilos para el foco de la práctica (público, ~10 filas).
    apiFetch("/styles")
      .then(async (res) => {
        if (res.ok) {
          setStyles((await res.json()) as { id: string; name: string }[]);
        } else {
          setStyles([]);
          setStylesError(true);
        }
      })
      .catch(() => {
        setStyles([]);
        setStylesError(true);
      });
  }, []);

  async function createPractice(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
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
          ...(styleId ? { style: styleId } : {}),
          ...(capacity ? { capacity: parseInt(capacity, 10) } : {}),
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      if (res.status === 401) {
        // Sesión caída - el contexto re-resuelve y el gate de login
        // aparece cuando me quede null.
        void refreshMe();
        return;
      }
      if (!res.ok) {
        setFormError(true);
        return;
      }
      const createdEv = (await res.json()) as { id: string };
      // Feedback de éxito antes del redirect al detalle (la práctica
      // recién creada ya vive como evento).
      setCreated(true);
      setTimeout(() => router.push(`/eventos/${createdEv.id}`), 1200);
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

  // "Hasta" ≤ "Desde" = cruza medianoche (el submit le suma +24h) -
  // el hint lo hace explícito en vez de corregir en silencio.
  const crossesMidnight = Boolean(
    date &&
      startTime &&
      endTime &&
      new Date(`${date}T${endTime}`) <= new Date(`${date}T${startTime}`),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-4 pt-3 sm:px-6">
      <h1 className="text-2xl font-bold leading-tight">{t("new")}</h1>

      {meLoading && <PageLoading />}
      {!meLoading && !me && (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/60">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      )}

      {created && (
        <Card className="p-6 text-center">
          <p role="status" className="text-lg font-bold text-neon">
            {t("created")}
          </p>
        </Card>
      )}

      {!!me && !created && (
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

          {/* Dirección + notas del lugar - el "dónde" en un solo bloque */}
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

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-white/70">{t("style")}</span>
            <select
              value={styleId}
              onChange={(e) => setStyleId(e.target.value)}
              disabled={styles === null}
              aria-busy={styles === null}
              className={`${inputCls} disabled:opacity-50`}
            >
              <option value="">{t("styleAny")}</option>
              {(styles ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {stylesError && (
              <span className="text-[11px] text-amber-300/80">
                {t("stylesLoadError")}
              </span>
            )}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
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
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
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

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
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
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
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
              {crossesMidnight && (
                <span className="text-[11px] text-white/40">
                  {t("endsNextDay")}
                </span>
              )}
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
