"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

// Mapa con pin arrastrable (spec academy-approval-gate): Leaflet no
// corre en SSR - import dinámico como EventsMap.
const AddressMapInner = dynamic(() => import("./address-map-inner"), {
  ssr: false,
});

/**
 * Perfil público de la academia (descripción, dirección, coordenadas y
 * contacto) - lo consumen GET /academies/:id/profile, el directorio y el
 * mapa de /academias. PATCH /academies/:id/settings, solo owner/ADMIN:
 * misma guard que AcademySettings (me.id === ownerId o rol ADMIN); sin
 * sesión resuelta no se renderiza (evita flash del card a instructores).
 */
export function AcademyProfile({ academy }: { academy: Academy }) {
  const t = useTranslations("academy.publicProfile");
  const tc = useTranslations("common");

  // /me compartido - misma guard que AcademySettings; mientras resuelve
  // el card queda oculto (instructores nunca lo ven).
  const { me, loading: meLoading } = useMe();
  const [description, setDescription] = useState(academy.description ?? "");
  const [address, setAddress] = useState(academy.address ?? "");
  const [addressExtra, setAddressExtra] = useState(
    academy.addressExtra ?? "",
  );
  // lat/lng ya no se tipean: salen del pin del mapa (geocode o ajuste).
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    academy.lat != null && academy.lng != null
      ? { lat: academy.lat, lng: academy.lng }
      : null,
  );
  const [geocoding, setGeocoding] = useState(false);
  const [instagram, setInstagram] = useState(academy.instagram ?? "");
  const [whatsapp, setWhatsapp] = useState(academy.whatsapp ?? "");
  const [website, setWebsite] = useState(academy.website ?? "");
  const [photoUrl, setPhotoUrl] = useState(academy.photoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canAdminister =
    !meLoading &&
    !!me &&
    (me.roles.includes("ADMIN") || me.id === academy.ownerId);
  // Deep link sin permiso: mensaje explícito en vez de página en blanco.
  if (meLoading) return null;
  if (!canAdminister) {
    return (
      <p role="alert" className="text-sm text-ink/60">
        {t("forbidden")}
      </p>
    );
  }

  // Geocoding vía Nominatim (OSM, restringido a Chile): la dirección
  // escrita (calle + numeración + comuna) ubica el pin; el owner lo
  // ajusta a mano si quedó corrido.
  async function locateOnMap() {
    setGeocoding(true);
    setError(null);
    try {
      const q = encodeURIComponent(address.trim());
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=cl&limit=1`,
        { headers: { "accept-language": "es" } },
      );
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (!res.ok || hits.length === 0) {
        setError(t("geocodeError"));
        return;
      }
      setCoords({ lat: Number(hits[0].lat), lng: Number(hits[0].lon) });
    } catch {
      setError(t("geocodeError"));
    } finally {
      setGeocoding(false);
    }
  }

  // Foto alojada por nosotros (spec academy-approval-gate): POST
  // multipart al endpoint de upload; photoUrl queda apuntando al
  // stream público /api/academies/photos/<key>.
  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await apiFetch(`/academies/${academy.id}/photo`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      const { photoUrl: url } = (await res.json()) as { photoUrl: string };
      setPhotoUrl(url);
    } catch {
      setError(t("saveError"));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await apiFetch(`/academies/${academy.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          address,
          addressExtra,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          instagram,
          whatsapp,
          website,
          photoUrl,
        }),
      });
      if (!res.ok) {
        setError((await readError(res)) ?? t("saveError"));
        return;
      }
      setFeedback(t("saved"));
    } catch {
      setError(t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink/50">
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-ink/40">{t("desc")}</p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3 lg:max-w-xl">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("description")}</span>
          <textarea
            rows={3}
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("address")}</span>
          <input
            type="text"
            className={inputCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("addressPlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("addressExtra")}</span>
          <input
            type="text"
            className={inputCls}
            value={addressExtra}
            onChange={(e) => setAddressExtra(e.target.value)}
            placeholder={t("addressExtraPlaceholder")}
          />
        </label>
        {/* lat/lng salen del pin, no de inputs: geocodifica la dirección
            escrita y el owner corrige arrastrando si quedó corrido. */}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={geocoding || address.trim().length < 5}
            onClick={() => void locateOnMap()}
          >
            {geocoding ? tc("loading") : t("locate")}
          </Button>
          {coords && (
            <>
              <div className="address-map h-56 overflow-hidden rounded-xl border border-line">
                <AddressMapInner
                  lat={coords.lat}
                  lng={coords.lng}
                  onChange={(lat, lng) => setCoords({ lat, lng })}
                />
              </div>
              <p className="text-xs text-ink/40">{t("mapHint")}</p>
            </>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("instagram")}</span>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="none"
              className={inputCls}
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder={t("instagramPlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("whatsapp")}</span>
            <input
              type="tel"
              inputMode="tel"
              className={inputCls}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder={t("whatsappPlaceholder")}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("website")}</span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            className={inputCls}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t("websitePlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink/50">{t("photo")}</span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="none"
            className={inputCls}
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder={t("photoPlaceholder")}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading}
            onClick={() =>
              (document.getElementById("academy-photo-file") as HTMLInputElement | null)?.click()
            }
          >
            {uploading ? t("photoUploading") : t("photoUpload")}
          </Button>
          <input
            id="academy-photo-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              void uploadPhoto(f);
            }}
          />
          {photoUrl.startsWith("/api/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? tc("loading") : tc("save")}
          </Button>
          {feedback && (
            <p role="status" className="text-sm text-neon">
              {feedback}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
