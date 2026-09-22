"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { Badge, Button } from "@/components/ui";
import { readError } from "@/components/academy/shared";

type Booking = "BOOKED" | "WAITLIST" | null;

/**
 * CTA del detalle de clase: Reservar / Anotarme en espera / estado +
 * Cancelar. Cancelar es inline de dos taps (sin window.confirm). El
 * estado inicial viene del server; tras reservar/cancelar se actualiza
 * local — sin re-fetch de la página.
 */
export function ClassBookingCta({
  classId,
  initialBooking,
  full,
  disabled,
}: {
  classId: string;
  initialBooking: Booking;
  full: boolean;
  /** Clase cancelada o ya pasada — la ficha queda solo informativa. */
  disabled?: boolean;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const [booking, setBooking] = useState<Booking>(initialBooking);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );

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
    <div className="flex flex-col gap-2">
      {booking === "BOOKED" || booking === "WAITLIST" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-800/60 px-4 py-3">
          <Badge variant={booking === "BOOKED" ? "neon" : "outline"}>
            {booking === "BOOKED" ? t("booked") : t("waitlist")}
          </Badge>
          {confirming ? (
            <div
              className="flex items-center gap-2"
              role="group"
              aria-label={t("cancelConfirm")}
            >
              <span className="text-xs text-white/60">{t("cancelShort")}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setConfirming(false);
                  void cancel();
                }}
              >
                {tc("yes")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {tc("no")}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {t("cancelBooking")}
            </Button>
          )}
        </div>
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
  );
}
