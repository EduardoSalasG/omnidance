"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";
import type { SongSuggestion } from "./shared";

type Props = { eventId: string };

/**
 * Top-20 de canciones pedidas por asistentes con ticket pagado
 * (GET /events/:id/song-suggestions).
 */
export function SuggestionsSection({ eventId }: Props) {
  const t = useTranslations("producer");
  const tc = useTranslations("common");

  const [items, setItems] = useState<SongSuggestion[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch(`/events/${eventId}/song-suggestions`);
      if (!res.ok) {
        setError(true);
        return;
      }
      setItems((await res.json()) as SongSuggestion[]);
    } catch {
      setError(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
        {t("sections.suggestions")}
      </h2>

      {items === null && !error && (
        <p className="text-sm text-white/60">{tc("loading")}</p>
      )}
      {error && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-400">{tc("error")}</p>
          <Button size="sm" variant="ghost" onClick={() => void load()}>
            ↻ {tc("retry")}
          </Button>
        </div>
      )}
      {items !== null && items.length === 0 && (
        <p className="text-sm text-white/50">{t("suggestions.empty")}</p>
      )}
      {items !== null && items.length > 0 && (
        <ol className="flex flex-col gap-1.5">
          {items.map((s, i) => (
            <li
              key={`${s.title}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-900 px-4 py-2.5"
            >
              <span className="min-w-0 truncate text-sm">
                <span className="mr-2 text-white/50">{i + 1}.</span>
                {s.title}
              </span>
              <span className="shrink-0 text-sm font-semibold text-neon">
                ×{s.count}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
