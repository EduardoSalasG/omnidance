"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { IDetectedBarcode } from "@yudiel/react-qr-scanner";
import { apiFetch } from "@/lib/api";
import { Badge, Button, Card, EventDate } from "@/components/ui";
import { Spinner } from "@/components/ui/spinner";

// Cámara solo en cliente — evita cualquier acceso a window en SSR.
const QrScanner = dynamic(() => import("@/components/sessions/QrScanner"), {
  ssr: false,
});

type Phase = "checking" | "unauth" | "pick" | "scan" | "camera-error" | "error";
type Feedback = { kind: "sent" | "cooldown" | "error"; partnerName?: string };

type EventListItem = {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  series: { name: string } | null;
  venue: { name: string };
};

const FEEDBACK_MS = 2600;

/**
 * Flujo de escaneo para invitar a bailar. Vive dentro del hub /qr —
 * el header/bottom-nav los da el chrome de la app, no el componente.
 * Sin `eventId` muestra el picker de eventos en vivo/publicados;
 * con `eventId` abre la cámara y postea /sessions/invite.
 */
export function DanceScanner({ eventId }: { eventId?: string }) {
  const t = useTranslations("sessions");
  const tStaff = useTranslations("staff");
  const tEvents = useTranslations("events");
  const tCommon = useTranslations("common");

  const [phase, setPhase] = useState<Phase>("checking");
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [camKey, setCamKey] = useState(0);

  const busyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth primero (invitar requiere sesión); sin eventId se lista qué está
  // en vivo/publicado para elegir dónde bailar.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const auth = await apiFetch("/qr/mine").catch(() => null);
      if (cancelled) return;
      if (!auth) {
        setPhase("error");
        return;
      }
      if (auth.status === 401) {
        setPhase("unauth");
        return;
      }
      if (eventId) {
        setPhase("scan");
        return;
      }
      const res = await apiFetch("/events").catch(() => null);
      if (cancelled) return;
      if (res?.ok) {
        setEvents((await res.json()) as EventListItem[]);
        setPhase("pick");
      } else {
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [eventId]);

  const showFeedback = useCallback((next: Feedback) => {
    setFeedback(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setFeedback(null);
      busyRef.current = false;
    }, FEEDBACK_MS);
  }, []);

  const handleScan = useCallback(
    async (codes: IDetectedBarcode[]) => {
      const qrToken = codes[0]?.rawValue;
      if (!qrToken || !eventId || busyRef.current) return;
      busyRef.current = true;

      try {
        const res = await apiFetch("/sessions/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrToken, eventId }),
        });
        if (res.status === 401) {
          setPhase("unauth");
          return;
        }
        if (!res.ok) {
          showFeedback({ kind: res.status === 409 ? "cooldown" : "error" });
          return;
        }
        // El invitee no viene en la respuesta — se busca en /sessions/mine.
        const { id } = (await res.json()) as { id: string };
        let partnerName: string | undefined;
        const mine = await apiFetch(`/sessions/mine?eventId=${eventId}`).catch(
          () => null,
        );
        if (mine?.ok) {
          const rows = (await mine.json()) as {
            id: string;
            partner: { name: string } | null;
          }[];
          partnerName = rows.find((s) => s.id === id)?.partner?.name;
        }
        showFeedback({ kind: "sent", partnerName });
      } catch {
        showFeedback({ kind: "error" });
      }
    },
    [eventId, showFeedback],
  );

  const handleCameraError = useCallback(() => {
    setPhase("camera-error");
  }, []);

  // ── Sin sesión ────────────────────────────────────────────
  if (phase === "unauth") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <p className="text-lg font-semibold">{t("scanToInvite")}</p>
        <Button href="/login" size="lg">
          {tCommon("login")}
        </Button>
      </div>
    );
  }

  // ── Error de red/API ──────────────────────────────────────
  if (phase === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        <p role="alert" className="text-lg font-semibold">
          {tCommon("error")}
        </p>
        <Button
          variant="secondary"
          size="lg"
          aria-label={tCommon("retry")}
          onClick={() => window.location.reload()}
        >
          ↻
        </Button>
      </div>
    );
  }

  // ── Sin eventId — selector de evento en vivo/publicado ────
  if (phase === "pick") {
    return (
      <div className="flex flex-col gap-5 pt-2">
        <h2 className="text-xl font-bold">{tEvents("title")}</h2>
        {events.length === 0 ? (
          <p role="status" className="text-white/60">
            {tEvents("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/qr?modo=escanear&event=${encodeURIComponent(e.id)}`}
                  className="block transition-transform active:scale-[0.98] motion-reduce:transition-none"
                >
                  <Card className="transition-colors hover:border-neon/50">
                    <div className="flex flex-wrap items-center gap-2">
                      {e.series && <Badge variant="neon">{e.series.name}</Badge>}
                      {e.status === "LIVE" && (
                        <Badge variant="live">{tEvents("live")}</Badge>
                      )}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold">{e.name}</h3>
                    <p className="text-sm text-white/60">
                      <EventDate start={e.startsAt} /> · {e.venue.name}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ── Escáner (checking incluido: la cámara tarda en abrir) ─
  return (
    <div className="flex min-h-[60dvh] flex-1 flex-col">
      <div className="relative flex-1 overflow-hidden rounded-2xl border border-night-700 bg-night-950">
        {phase === "checking" ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" className="page-loading" />
          </div>
        ) : phase === "scan" ? (
          <QrScanner
            key={camKey}
            onScan={handleScan}
            onError={handleCameraError}
            paused={feedback != null}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
            <p role="alert" className="text-lg font-semibold">
              {tStaff("cameraError")}
            </p>
            <Button
              size="lg"
              onClick={() => {
                setCamKey((k) => k + 1);
                setPhase("scan");
              }}
            >
              {tStaff("scan")}
            </Button>
          </div>
        )}

        {/* Toast de resultado — grande, legible a brazo extendido */}
        {feedback && (
          <div className="absolute inset-x-4 bottom-6">
            <Card
              role={feedback.kind === "sent" ? "status" : "alert"}
              className={`border-2 py-4 text-center ${
                feedback.kind === "sent"
                  ? "border-neon text-neon"
                  : feedback.kind === "cooldown"
                    ? "border-amber-400/70 text-amber-300"
                    : "border-red-500/60 text-red-300"
              }`}
            >
              <p className="text-xl font-bold">
                {feedback.kind === "sent"
                  ? t("inviteSent")
                  : feedback.kind === "cooldown"
                    ? t("cooldown")
                    : tCommon("error")}
              </p>
              {feedback.kind === "sent" && feedback.partnerName && (
                <p className="mt-1 text-base font-semibold text-white">
                  {feedback.partnerName}
                </p>
              )}
            </Card>
          </div>
        )}
      </div>

      <p className="px-6 pt-4 text-center text-lg font-semibold">
        {t("scanToInvite")}
      </p>
    </div>
  );
}
