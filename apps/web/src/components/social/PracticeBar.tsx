"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui";

export type PracticeBarProps = {
  eventId: string;
  /** rsvpCount del detalle público — visible antes de resolver la sesión. */
  initialCount: number;
};

/**
 * Sticky CTA de una práctica (spec §8: gratis, first-come, sin ticket).
 * La acción evoluciona con la intención: no voy → "Me apunto" (RSVP);
 * voy → "Mostrar mi QR" (el host escanea al llegar) + "Ya no voy".
 */
export function PracticeBar({ eventId, initialCount }: PracticeBarProps) {
  const t = useTranslations("events");
  const tc = useTranslations("common");
  // null = resolviendo sesión/estado; undefined nunca se usa.
  const [state, setState] = useState<{ going: boolean; count: number } | null>(
    null,
  );
  const [unauth, setUnauth] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch(`/practices/${eventId}/rsvp`)
      .then(async (res) => {
        if (res.status === 401) {
          setUnauth(true);
          return;
        }
        if (res.ok) setState((await res.json()) as typeof state);
      })
      .catch(() => setState({ going: false, count: initialCount }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialCount es snapshot del SSR
  }, [eventId]);

  const going = state?.going ?? false;
  const count = state?.count ?? initialCount;

  async function toggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    const res = await apiFetch(`/practices/${eventId}/rsvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ going: next }),
    }).catch(() => null);
    setBusy(false);
    if (res?.status === 401) {
      setUnauth(true);
      return;
    }
    if (res?.ok) setState((await res.json()) as typeof state);
  }

  return (
    <>
      <div className="min-w-0">
        <span className="block text-xs text-white/50">
          {going
            ? t("goingCount", { count })
            : `${t("practiceFree")} · ${t("goingCount", { count })}`}
        </span>
        <span className="text-lg font-semibold text-neon">
          {going ? `✓ ${t("youreGoing")}` : t("free")}
        </span>
      </div>
      {unauth ? (
        <Button href="/login" size="lg">
          {t("imGoing")}
        </Button>
      ) : state === null ? (
        <Button size="lg" disabled>
          {tc("loading")}
        </Button>
      ) : going ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button href="/qr?modo=mio" size="lg">
            {t("showQr")}
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle(false)}
            className="min-h-11 px-2 text-xs text-white/50 underline-offset-4 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon disabled:opacity-50"
          >
            {t("notGoing")}
          </button>
        </div>
      ) : (
        <Button
          size="lg"
          disabled={busy}
          onClick={() => void toggle(true)}
          className="shrink-0"
        >
          {t("imGoing")}
        </Button>
      )}
    </>
  );
}
