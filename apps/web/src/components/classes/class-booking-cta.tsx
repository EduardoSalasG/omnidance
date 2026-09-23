"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Badge, Button, Card } from "@/components/ui";
import { readError } from "@/components/academy/shared";

type Booking = "BOOKED" | "WAITLIST" | null;

/**
 * CTA del detalle de clase: Reservar / Anotarme en espera / estado.
 * Cancelar vive en la zona destructiva al pie de la ficha (patrón
 * "eliminar amigo"): lejos del pulgar + confirmación en bottom sheet,
 * no inline. El estado inicial viene del server; tras reservar/cancelar
 * se actualiza local — sin re-fetch de la página.
 */
export function ClassBookingCta({
  classId,
  initialBooking,
  full,
  enrolled,
  disabled,
}: {
  classId: string;
  initialBooking: Booking;
  full: boolean;
  /** Inscripción vigente en la academia — sin ella no se puede reservar. */
  enrolled: boolean;
  /** Clase cancelada o ya pasada — la ficha queda solo informativa. */
  disabled?: boolean;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [booking, setBooking] = useState<Booking>(initialBooking);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useDialogFocus<HTMLDivElement>(confirming);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );

  // Escape cierra el sheet de confirmación.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  async function book() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${classId}/book`, {
        method: "POST",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      const b = (await res.json()) as { status?: string };
      const status = b.status === "WAITLIST" ? "WAITLIST" : "BOOKED";
      setBooking(status);
      setNotice({
        text: status === "WAITLIST" ? t("waitlistOk") : t("bookedOk"),
        error: false,
      });
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/classes/${classId}/book`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      setBooking(null);
      setNotice({ text: t("cancelledOk"), error: false });
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {booking === "BOOKED" || booking === "WAITLIST" ? (
          <div className="flex items-center gap-3 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
            <Badge variant={booking === "BOOKED" ? "neon" : "outline"}>
              {booking === "BOOKED" ? t("booked") : t("waitlist")}
            </Badge>
          </div>
        ) : !enrolled ? (
          <p className="rounded-xl border border-white/10 bg-night-800/40 px-4 py-3 text-center text-sm text-white/50">
            {t("requiresEnrollment")}
          </p>
        ) : full ? (
          <Button className="w-full" disabled={busy} onClick={() => void book()}>
            {t("joinWaitlist")}
          </Button>
        ) : (
          <Button className="w-full" disabled={busy} onClick={() => void book()}>
            {t("book")}
          </Button>
        )}
        {notice && (
          <p
            role={notice.error ? "alert" : "status"}
            className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
          >
            {notice.text}
          </p>
        )}
      </div>

      {/* Zona destructiva al pie del contenido, centrada — patrón
          "eliminar amigo": lejos del pulgar, la confirmación va en
          bottom sheet (no inline ni window.confirm). */}
      {booking && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            {t("cancelBooking")}
          </button>
        </div>
      )}

      {/* Confirmación de cancelar reserva — bottom sheet */}
      {confirming && (
        <div
          ref={dialogRef}
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-night-950/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setConfirming(false)}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-booking-title"
            className="w-full max-w-md space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h2 id="cancel-booking-title" className="text-lg font-semibold">
              {t("cancelBooking")}
            </h2>
            <p className="text-sm text-white/70">{t("cancelConfirm")}</p>
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirming(false)}
              >
                {tc("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  void cancel();
                }}
              >
                {t("cancelBooking")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
