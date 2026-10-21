"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useFeatures } from "@/lib/features-context";
import { EventCard, type EventCardData } from "@/components/events/event-card";
import {
  Button,
  CheckIcon,
  ChevronRightIcon,
  RefreshIcon,
  SkeletonList,
  XIcon,
} from "@/components/ui";
import { dayKey } from "@/lib/calendar";
import { Link } from "@/i18n/navigation";
import { useDateFmt } from "@/lib/intl";

// Mi viaje (spec mi-viaje): el itinerario multipaís del bailarín -
// eventos guardados agrupados por ciudad (orden del grupo = fecha de
// su primer evento) y por fecha dentro del grupo. Nota privada inline
// por ítem (guarda en blur/Enter) y quitar sin confirmación (es
// reversible: se re-agrega desde la ficha). Detrás del flag
// trip_planner - OFF muestra el estado "módulo desactivado" (mismo
// criterio que /admin/ciudades; el API 404ea igual).

/** Item de GET /me/trip: shape del feed (EventCard) + city + nota. */
type TripItem = EventCardData & {
  city: { name: string; slug: string } | null;
  note: string | null;
  addedAt: string;
};

type CityGroup = {
  key: string;
  city: TripItem["city"];
  items: TripItem[];
};

/** Ciudad → fecha: grupos en orden de llegada = primer evento más
    cercano primero (el API ya devuelve por startsAt asc). */
function groupByCity(items: TripItem[]): CityGroup[] {
  const map = new Map<string, CityGroup>();
  for (const item of items) {
    const key = item.city?.slug ?? "_none";
    let g = map.get(key);
    if (!g) {
      g = { key, city: item.city, items: [] };
      map.set(key, g);
    }
    g.items.push(item);
  }
  return [...map.values()];
}

export default function MiViajePage() {
  const t = useTranslations("trip");
  const te = useTranslations("events");
  const tc = useTranslations("common");
  const { flags, loading: flagsLoading } = useFeatures();
  const { me, loading: meLoading } = useMe();
  const enabled = flags.trip_planner === true;
  const meChecked = !meLoading;

  const [items, setItems] = useState<TripItem[] | null>(null);
  const [error, setError] = useState(false);
  // Fallo de una acción por ítem (quitar) - el listado sigue visible.
  const [actionError, setActionError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch("/me/trip");
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems((await res.json()) as TripItem[]);
    } catch {
      setError(true);
    }
  }, []);

  // El fetch espera a flag ON + sesión - con flag apagado el API
  // responde 404, así que ni siquiera se intenta (patrón /admin/ciudades).
  useEffect(() => {
    if (enabled && me) void load();
  }, [enabled, me, load]);

  const groups = useMemo(() => groupByCity(items ?? []), [items]);
  const dayFmt = useDateFmt({
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const dayLabel = (iso: string) => {
    const today = dayKey(new Date().toISOString());
    const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
    const key = dayKey(iso);
    if (key === today) return te("today");
    if (key === tomorrow) return te("tomorrow");
    return dayFmt.format(new Date(iso));
  };

  const removeItem = async (eventId: string) => {
    const prev = items ?? [];
    // Optimista: quita al tiro - la acción es reversible re-agregando
    // desde la ficha, no pide confirmación (spec).
    setItems(prev.filter((i) => i.id !== eventId));
    try {
      const res = await apiFetch(`/me/trip/${eventId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`trip ${res.status}`);
    } catch {
      // Reversa por refetch: el servidor es la verdad del orden.
      setActionError(true);
      void load();
    }
  };

  const noteSaved = (eventId: string, note: string | null) => {
    setItems((cur) =>
      (cur ?? []).map((i) => (i.id === eventId ? { ...i, note } : i)),
    );
  };

  let content: React.ReactNode;
  if (flagsLoading || !meChecked) {
    content = <SkeletonList items={4} />;
  } else if (!enabled) {
    content = <p className="text-sm text-ink/60">{t("disabled")}</p>;
  } else if (!me) {
    // Middleware redirige anónimos a /login - esto cubre sesión
    // expirada en caliente.
    content = (
      <Button href="/login" variant="secondary" className="self-start">
        {t("signIn")}
      </Button>
    );
  } else if (error) {
    content = (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-ink/60">
          {t("loadError")}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshIcon /> {tc("retry")}
        </Button>
      </div>
    );
  } else if (items === null) {
    content = <SkeletonList items={4} />;
  } else if (groups.length === 0) {
    content = (
      <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line px-5 py-8">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-8 w-8 text-neon"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
        <div>
          <p className="font-semibold">{t("empty")}</p>
          <p className="mt-1 text-sm text-ink/60">{t("emptyDesc")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href="/ciudades" size="sm">
            {t("emptyCta")}
          </Button>
          <Button href="/eventos" variant="secondary" size="sm">
            {t("emptyCtaEvents")}
          </Button>
        </div>
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <section
            key={g.key}
            aria-labelledby={`trip-city-${g.key}`}
            className="flex flex-col gap-3"
          >
            <h2 id={`trip-city-${g.key}`} className="text-lg font-semibold">
              {g.city ? (
                <Link
                  href={`/ciudades/${g.city.slug}`}
                  className="group inline-flex min-h-11 items-center gap-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
                >
                  {g.city.name}
                  <ChevronRightIcon className="h-4 w-4 text-ink/40 transition-colors group-hover:text-neon" />
                </Link>
              ) : (
                t("noCity")
              )}
            </h2>
            <ul className="flex flex-col gap-5">
              {g.items.map((item) => (
                <TripItemRow
                  key={item.id}
                  item={item}
                  when={dayLabel(item.startsAt)}
                  onRemove={() => void removeItem(item.id)}
                  onNoteSaved={noteSaved}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-ink/60">{t("subtitle")}</p>
      </header>
      {actionError && (
        <p role="alert" className="text-sm text-ink/60">
          {t("actionError")}
        </p>
      )}
      {content}
    </main>
  );
}

/** Card del evento + fila de nota/quitar - la nota va FUERA del Link
    (ui-lists: nada interactivo anidado dentro de una fila-link). */
function TripItemRow({
  item,
  when,
  onRemove,
  onNoteSaved,
}: {
  item: TripItem;
  when: string;
  onRemove: () => void;
  onNoteSaved: (eventId: string, note: string | null) => void;
}) {
  const t = useTranslations("trip");
  const [note, setNote] = useState(item.note ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const saveNote = async () => {
    const next = note.trim();
    if (next === (item.note ?? "")) return;
    try {
      const res = await apiFetch(`/me/trip/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: next }),
      });
      if (!res.ok) throw new Error(`trip ${res.status}`);
      onNoteSaved(item.id, next || null);
      setStatus("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
    }
  };

  return (
    <li className="flex flex-col gap-1.5">
      <EventCard e={item} when={when} />
      {/* Nota privada del viaje: input "fantasma" - aparece como texto
          hasta hover/focus (mismo lenguaje de inputs dark-first). */}
      <div className="flex items-center gap-2 px-1">
        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onBlur={() => void saveNote()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          maxLength={500}
          placeholder={t("notePlaceholder")}
          aria-label={t("noteLabel", { event: item.name })}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink placeholder:text-ink/40 transition-colors hover:border-line focus:border-neon focus:bg-canvas focus-visible:outline-none"
        />
        {status === "saved" && (
          <span role="status" className="shrink-0 text-neon">
            <CheckIcon className="h-4 w-4" />
            <span className="sr-only">{t("noteSaved")}</span>
          </span>
        )}
        {status === "error" && (
          <p role="alert" className="shrink-0 text-sm text-ink/60">
            {t("noteError")}
          </p>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("removeLabel", { event: item.name })}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink/50 transition-colors hover:bg-elevated hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          <XIcon className="h-4 w-4" />
          {t("remove")}
        </button>
      </div>
    </li>
  );
}
