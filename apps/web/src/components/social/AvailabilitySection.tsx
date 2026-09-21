"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button, Card, EventDate } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";
import { PartnerAvatar } from "@/components/sessions/PartnerAvatar";
import type { AvailabilityEntry, Me } from "./types";

const inputCls =
  "min-h-11 w-full rounded-xl border border-night-700 bg-night-800 px-4 py-3 " +
  "text-white placeholder:text-white/50 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon";

type FeedState = "loading" | "ready" | "error";

export type AvailabilitySectionProps = {
  /** undefined = sesión aún cargando; null = sin sesión (GET /me → 401). */
  me: Me | null | undefined;
};

/**
 * Sección "Disponibles ahora": toggle propio (POST /availability, optimista)
 * + feed público de quién está disponible (GET /availability).
 */
export function AvailabilitySection({ me }: AvailabilitySectionProps) {
  const t = useTranslations("availability");
  const tt = useTranslations("trips"); // reutiliza trips.until ("Hasta")
  const tc = useTranslations("common");
  const titleId = useId();
  const toggleLabelId = useId();

  const [available, setAvailable] = useState(false);
  const [location, setLocation] = useState("");
  const [toggleError, setToggleError] = useState(false);
  // Última ubicación ya persistida — evita POSTs redundantes en cada blur.
  const savedLocation = useRef("");

  const [feedState, setFeedState] = useState<FeedState>("loading");
  const [entries, setEntries] = useState<AvailabilityEntry[]>([]);

  const loadFeed = useCallback(async () => {
    const res = await apiFetch("/availability").catch(() => null);
    if (!res || !res.ok) {
      setFeedState("error");
      return;
    }
    setEntries((await res.json()) as AvailabilityEntry[]);
    setFeedState("ready");
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  async function save(body: { available: boolean; location?: string }) {
    setToggleError(false);
    const res = await apiFetch("/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (!res || !res.ok) {
      setToggleError(true);
      return false;
    }
    return true;
  }

  async function flip() {
    const next = !available;
    setAvailable(next); // optimista — se revierte si el POST falla
    const ok = await save(
      next
        ? { available: true, location: location || undefined }
        : { available: false },
    );
    if (!ok) {
      setAvailable(!next);
      return;
    }
    savedLocation.current = location;
    void loadFeed();
  }

  async function saveLocation() {
    if (!available || location === savedLocation.current) return;
    const ok = await save({
      available: true,
      location: location || undefined,
    });
    if (ok) {
      savedLocation.current = location;
      void loadFeed();
    }
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2
        id={titleId}
        className="text-sm font-semibold uppercase tracking-wide text-white/50"
      >
        {t("feedTitle")}
      </h2>

      {/* Toggle propio — requiere sesión; el feed de abajo es público */}
      {me === null ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-sm text-white/60">{t("loginRequired")}</p>
          <Button href="/login" size="sm">
            {tc("login")}
          </Button>
        </Card>
      ) : me === undefined ? null : (
        <Card>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p id={toggleLabelId} className="font-semibold">
                {t("toggle")}
              </p>
              <p role="status" className="text-sm text-white/50">
                {available ? t("toggleOn") : t("toggleOff")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={available}
              aria-labelledby={toggleLabelId}
              onClick={() => void flip()}
              className={`flex h-11 w-16 shrink-0 items-center rounded-full px-1 transition-colors transition-transform active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon ${
                available ? "bg-neon" : "bg-night-700"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-9 w-9 rounded-full bg-white shadow transition-transform ${
                  available ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {available && (
            <label className="mt-3 flex flex-col gap-1.5 text-sm">
              <span className="text-white/70">{t("location")}</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onBlur={() => void saveLocation()}
                className={inputCls}
              />
            </label>
          )}
          {toggleError && (
            <p role="alert" className="mt-2 text-sm text-red-400">
              {tc("error")}
            </p>
          )}
        </Card>
      )}

      {/* Feed público */}
      {feedState === "loading" && <Spinner size="sm" />}
      {feedState === "error" && (
        <p role="alert" className="text-white/60">
          {tc("error")}
        </p>
      )}
      {feedState === "ready" &&
        (entries.length === 0 ? (
          <Card>
            <p role="status" className="text-white/60">
              {t("feedEmpty")}
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <li key={e.person.id}>
                <Card className="flex items-center gap-3">
                  <PartnerAvatar
                    name={e.person.name}
                    photoUrl={e.person.photoUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.person.name}</p>
                    {e.location && (
                      <p className="truncate text-sm text-white/60">
                        {e.location}
                      </p>
                    )}
                  </div>
                  {e.until && (
                    <p className="shrink-0 text-xs text-white/50">
                      {tt("until")}{" "}
                      <EventDate variant="time" start={e.until} />
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
