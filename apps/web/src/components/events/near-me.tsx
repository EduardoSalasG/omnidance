"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useFeatures } from "@/lib/features-context";
import { EventCard, type EventCardData } from "./event-card";
import { Badge, Spinner } from "@/components/ui";
import { Link, useRouter } from "@/i18n/navigation";

/**
 * "Cerca de mí" de /eventos (spec city-discovery): geolocalización del
 * browser → GET /events/near → resultados con el mismo card del feed.
 *
 * Es ACCIÓN del usuario - el spinner va inline inmediato en el botón
 * (no skeleton: la latencia la pide él, no el sistema). Permiso
 * denegado o API sin geolocation → copy útil + fallback "elige tu
 * ciudad" (select del directorio público). Nunca bloquea la página:
 * es una sección aditiva sobre el feed, no un gate.
 *
 * Todo detrás del flag city_landing vía useFeatures - OFF (o aún sin
 * resolver) → no se renderiza.
 */

type NearestCity = { name: string; slug: string; distanceKm: number };
type NearResult = {
  events: EventCardData[];
  nearestCity?: NearestCity;
};
type CityOption = {
  slug: string;
  name: string;
  country: { name: string };
};

type State =
  | { kind: "idle" }
  | { kind: "locating" } // esperando respuesta del navegador
  | { kind: "loading" } // coords obtenidas, fetch en curso
  | { kind: "denied" } // permiso denegado / sin geolocation / timeout
  | { kind: "results"; data: NearResult }
  | { kind: "error" }; // fetch falló (red/500) - retry disponible

const chipCls =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-ink/15 px-4 text-sm font-medium text-ink/60 transition-colors hover:border-ink/30 hover:text-ink active:scale-[0.97] disabled:opacity-60";

const selectCls =
  "min-h-11 w-full max-w-xs rounded-xl border border-line bg-elevated px-3 text-sm text-ink focus:border-neon/60 focus-visible:ring-2 focus-visible:ring-neon/50";

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function NearMeSection() {
  const t = useTranslations("cities");
  const tc = useTranslations("common");
  const { flags, loading } = useFeatures();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [cities, setCities] = useState<CityOption[] | null>(null);

  const busy = state.kind === "locating" || state.kind === "loading";

  // Fallback manual: el directorio se pide solo si hace falta (permiso
  // denegado) - no precargamos ciudades en cada visita a /eventos.
  const loadCities = async () => {
    if (cities !== null) return;
    try {
      const res = await apiFetch("/cities");
      if (res.ok) setCities((await res.json()) as CityOption[]);
    } catch {
      // Red caída: queda el link al directorio como fallback.
    }
  };

  const fetchNear = async (lat: number, lng: number) => {
    setState({ kind: "loading" });
    try {
      const res = await apiFetch(
        `/events/near?lat=${lat}&lng=${lng}`,
      );
      if (!res.ok) {
        setState({ kind: "error" });
        return;
      }
      setState({ kind: "results", data: (await res.json()) as NearResult });
    } catch {
      setState({ kind: "error" });
    }
  };

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState({ kind: "denied" });
      void loadCities();
      return;
    }
    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => void fetchNear(pos.coords.latitude, pos.coords.longitude),
      // Denegado, timeout (~8s) o no disponible → mismo estado con
      // fallback manual; nunca re-pregunta ni bloquea.
      () => {
        setState({ kind: "denied" });
        void loadCities();
      },
      { timeout: 8000, maximumAge: 300_000 },
    );
  };

  // Flag OFF o sin resolver (fail-closed): ni el botón ni la sección.
  if (loading || !flags.city_landing) return null;

  const result =
    state.kind === "results" ? state.data : null;

  return (
    <section aria-label={t("nearMe")} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          aria-busy={busy}
          className={chipCls}
        >
          {busy ? <Spinner size="sm" label={t("locating")} /> : <PinIcon />}
          {busy ? t("locating") : t("nearMe")}
        </button>
        {result && (
          <>
            <Badge variant="neon">{t("nearYou")}</Badge>
            <button
              type="button"
              onClick={() => setState({ kind: "idle" })}
              className="inline-flex min-h-11 items-center text-sm text-ink/60 transition-colors hover:text-ink"
            >
              {t("nearClear")}
            </button>
          </>
        )}
      </div>

      {state.kind === "denied" && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-ink/60">
            {t("nearDeniedTitle")} · {t("nearDeniedDesc")}
          </p>
          {cities && cities.length > 0 ? (
            <label className="flex flex-col gap-1">
              <span className="sr-only">{t("chooseCity")}</span>
              <select
                className={selectCls}
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    router.push(`/ciudades/${e.target.value}`);
                  }
                }}
              >
                <option value="" disabled>
                  {t("chooseCity")}
                </option>
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name} · {c.country.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Link href="/ciudades" className={chipCls}>
              <PinIcon />
              {t("chooseCity")}
            </Link>
          )}
        </div>
      )}

      {state.kind === "error" && (
        <p role="alert" className="text-sm text-ink/60">
          {t("nearError")}{" "}
          <button
            type="button"
            onClick={locate}
            className="font-medium text-neon underline-offset-4 hover:underline"
          >
            {tc("retry")}
          </button>
        </p>
      )}

      {result &&
        (result.events.length > 0 ? (
          <ul className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
            {result.events.map((e) => (
              <li key={e.id}>
                <EventCard e={e} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink/60">{t("nearEmpty")}</p>
            {result.nearestCity && (
              <p className="text-sm text-ink/60">
                {t("nearestSuggestion", {
                  city: result.nearestCity.name,
                  km: result.nearestCity.distanceKm,
                })}{" "}
                <Link
                  href={`/ciudades/${result.nearestCity.slug}`}
                  className="font-medium text-neon underline-offset-4 hover:underline"
                >
                  {t("viewCity", { city: result.nearestCity.name })}
                </Link>
              </p>
            )}
          </div>
        ))}
    </section>
  );
}
