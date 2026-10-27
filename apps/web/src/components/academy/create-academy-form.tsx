"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import { inputCls, readError, type Academy } from "./shared";

/** GET /cities/catalog - país del catálogo geográfico con sus ciudades. */
type CountryCatalog = {
  code: string;
  name: string;
  currency: string;
  cities: { id: string; name: string }[];
};

/**
 * Form de alta de academia (POST /academies) - compartido entre el
 * estado `empty` del AcademyGate (primera academia) y /academia/nueva
 * (segunda+). onCreated decide el flujo: el gate re-boots, la página
 * persiste la selección y vuelve al hub.
 * País → ciudad del catálogo (spec platform-multicountry): la ciudad
 * define Country.currency de planes/facturación - opcional, sin ella
 * la academia queda sin ciudad (moneda CLP por fallback del API).
 */
export function CreateAcademyForm({
  onCreated,
}: {
  onCreated: (academy: Academy) => void | Promise<void>;
}) {
  const t = useTranslations("academy");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [catalog, setCatalog] = useState<CountryCatalog[]>([]);
  const [countryCode, setCountryCode] = useState("CL");
  const [cityId, setCityId] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Catálogo país→ciudades para el selector (público, sin flag).
  useEffect(() => {
    let cancelled = false;
    apiFetch("/cities/catalog")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const countries = (await res.json()) as CountryCatalog[];
        if (cancelled || !countries.length) return;
        setCatalog(countries);
        setCountryCode((cur) =>
          countries.some((c) => c.code === cur) ? cur : countries[0].code,
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const cities =
    catalog.find((c) => c.code === countryCode)?.cities ?? [];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCreateError(null);
    try {
      const res = await apiFetch("/academies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(cityId ? { cityId } : {}),
        }),
      });
      if (!res.ok) {
        // 403 = sin rol ACADEMY_OWNER - el message del server lo explica.
        setCreateError((await readError(res)) ?? tc("error"));
        return;
      }
      setName("");
      setCityId("");
      await onCreated((await res.json()) as Academy);
    } catch {
      setCreateError(tc("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-3 flex flex-col gap-3 lg:max-w-xl">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink/50">
          {t("academyName")}
          <span aria-hidden="true" className="text-neon"> *</span>
        </span>
        <input
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      {catalog.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("country")}</span>
            <select
              className={inputCls}
              value={countryCode}
              onChange={(e) => {
                setCountryCode(e.target.value);
                setCityId("");
              }}
            >
              {catalog.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">{t("city")}</span>
            <select
              className={inputCls}
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
            >
              <option value="">{t("noCity")}</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {createError && (
        <p role="alert" className="text-sm text-red-400">
          {createError}
        </p>
      )}
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? tc("loading") : tc("create")}
        </Button>
      </div>
    </form>
  );
}
