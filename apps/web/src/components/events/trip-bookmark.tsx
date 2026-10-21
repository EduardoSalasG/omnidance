"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { useFeatures } from "@/lib/features-context";
import { Link } from "@/i18n/navigation";

// Toggle "Guardar en Mi viaje" (spec mi-viaje): bookmark outline→filled
// en la ficha del evento. Optimista - el icono filled ES el feedback
// (acción instantánea percibida, sin spinner); en error revierte y
// anuncia vía role="status". Solo con flag trip_planner ON + sesión;
// sin sesión → link discreto a login (vuelve a esta ficha con next=).

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function TripBookmark({
  eventId,
  initialSaved,
}: {
  eventId: string;
  /** Estado inicial resuelto server-side (GET /me/trip/ids). */
  initialSaved: boolean;
}) {
  const t = useTranslations("trip");
  const { flags } = useFeatures();
  const { me, loading: meLoading } = useMe();
  const [saved, setSaved] = useState(initialSaved);
  const [announce, setAnnounce] = useState("");
  const [failed, setFailed] = useState(false);
  // Guard anti doble-tap: el estado ya volteó optimista, un segundo tap
  // en vuelo invertiría sobre una respuesta que aún no llega.
  const busy = useRef(false);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !saved;
    setSaved(next);
    setFailed(false);
    try {
      const res = await apiFetch(`/me/trip/${eventId}`, {
        method: next ? "PUT" : "DELETE",
        ...(next
          ? {
              headers: { "Content-Type": "application/json" },
              body: "{}",
            }
          : {}),
      });
      if (!res.ok) throw new Error(`trip ${res.status}`);
      setAnnounce(next ? t("added") : t("removed"));
    } catch {
      setSaved(!next);
      setFailed(true);
      setAnnounce(t("toggleError"));
    } finally {
      busy.current = false;
    }
  };

  if (flags.trip_planner !== true) return null;
  // /me aún en vuelo: no pintar nada - evita flash del link de login a
  // usuarios autenticados (mismo criterio que /practicas).
  if (meLoading) return null;

  if (!me) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/eventos/${eventId}`)}`}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-ink/60 underline-offset-4 transition-colors hover:text-neon hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
      >
        <BookmarkIcon filled={false} />
        {t("signInToSave")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-pressed={saved}
        onClick={() => void toggle()}
        className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors transition-transform active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neon ${
          saved
            ? "border-neon bg-neon/10 text-neon"
            : "border-line bg-surface text-ink/80 hover:border-neon/60 hover:text-ink"
        }`}
      >
        <BookmarkIcon filled={saved} />
        {saved ? t("saved") : t("save")}
      </button>
      {failed && (
        <p role="alert" className="text-sm text-ink/60">
          {t("toggleError")}
        </p>
      )}
      {/* Anuncio sr-only del resultado del toggle (guardado/quitado/error). */}
      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
