"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { Button, Card } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

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
  const [lat, setLat] = useState(academy.lat != null ? String(academy.lat) : "");
  const [lng, setLng] = useState(academy.lng != null ? String(academy.lng) : "");
  const [instagram, setInstagram] = useState(academy.instagram ?? "");
  const [whatsapp, setWhatsapp] = useState(academy.whatsapp ?? "");
  const [website, setWebsite] = useState(academy.website ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const canAdminister =
    !meLoading &&
    !!me &&
    (me.roles.includes("ADMIN") || me.id === academy.ownerId);
  if (!canAdminister) return null;

  const parseCoord = (raw: string): number | null | undefined => {
    const t = raw.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const latN = parseCoord(lat);
    const lngN = parseCoord(lng);
    if (
      latN === undefined ||
      lngN === undefined ||
      (latN !== null && (latN < -90 || latN > 90)) ||
      (lngN !== null && (lngN < -180 || lngN > 180))
    ) {
      setError(t("invalidCoords"));
      setFeedback(null);
      return;
    }
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
          lat: latN,
          lng: lngN,
          instagram,
          whatsapp,
          website,
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
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("title")}
      </h2>
      <p className="mt-1 text-xs text-white/40">{t("desc")}</p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3 lg:max-w-xl">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">{t("description")}</span>
          <textarea
            rows={3}
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("descriptionPlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-white/50">{t("address")}</span>
          <input
            type="text"
            className={inputCls}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder={t("addressPlaceholder")}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("lat")}</span>
            <input
              type="text"
              inputMode="decimal"
              className={inputCls}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="-33.4489"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("lng")}</span>
            <input
              type="text"
              inputMode="decimal"
              className={inputCls}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="-70.6693"
            />
          </label>
        </div>
        <p className="text-xs text-white/40">{t("coordsHint")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-white/50">{t("instagram")}</span>
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
            <span className="text-xs text-white/50">{t("whatsapp")}</span>
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
          <span className="text-xs text-white/50">{t("website")}</span>
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
