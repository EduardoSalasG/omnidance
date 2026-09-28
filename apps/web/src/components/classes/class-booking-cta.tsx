"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Button, Card, PriceTag } from "@/components/ui";
import { readError } from "@/components/academy/shared";

type Booking = "BOOKED" | "WAITLIST" | null;

/** Créditos del plan vigente sobre esta clase (myCredits del API):
    WEEKLY = cuota de la semana ISO; PACK = saldo del pack. */
export type ClassCredits = {
  kind: "WEEKLY" | "PACK";
  used: number | null;
  limit: number | null;
} | null;

/**
 * Acción de la ficha de clase en barra fija sobre la BottomNav — mismo
 * patrón que la ficha de evento (cupos a la izquierda, acción a la
 * derecha). Cancelar vive en la zona destructiva al pie del contenido
 * (patrón "eliminar amigo"): lejos del pulgar + confirmación en bottom
 * sheet, no inline. El estado inicial viene del server; tras
 * reservar/cancelar se actualiza local — sin re-fetch de la página.
 */
export function ClassBookingCta({
  classId,
  initialBooking,
  initialPaid = false,
  enrolled,
  academyId,
  spotsLeft,
  capacity,
  waitlistCount,
  myCredits = null,
  cancelRefundMinutes = 60,
  startsAtIso,
  dropInPrice = null,
  closedLabel,
}: {
  classId: string;
  initialBooking: Booking;
  /** El asiento vigente fue comprado suelto (taller/clase) — la
      cancelación libera el cupo pero no devuelve el pago (gestión
      manual de la academia). */
  initialPaid?: boolean;
  /** Inscripción vigente en la academia — sin ella no se puede reservar
      por plan (pero sí comprar suelta si hay dropInPrice). */
  enrolled: boolean;
  /** Academia dueña de la clase — el CTA "sin inscripción" lleva a su
      ficha, donde están los planes comprables. */
  academyId: string;
  spotsLeft: number;
  capacity: number;
  waitlistCount: number;
  /** Cuota del plan del viewer (null = ilimitado o sin cuota). */
  myCredits?: ClassCredits;
  /** Ventana de devolución (min antes del inicio) — param operativo. */
  cancelRefundMinutes?: number;
  /** Instante real de inicio (date + startTime) — base del corte. */
  startsAtIso?: string;
  /** Precio de clase suelta (ClassSeries.dropInPrice) — habilita la
      compra WORKSHOP desde la barra. */
  dropInPrice?: number | null;
  /** Clase cancelada o ya pasada — la barra muestra un aviso y la ficha
      queda solo informativa (sin acción ni zona destructiva). */
  closedLabel?: string;
}) {
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const router = useRouter();
  const [booking, setBooking] = useState<Booking>(initialBooking);
  const [paid] = useState(initialPaid);
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
      // El badge "Reservado" del header es server-rendered — refresh lo
      // sincroniza sin perder el estado local del componente.
      router.refresh();
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setNotice(null);
    const wasBooked = booking === "BOOKED";
    try {
      const res = await apiFetch(`/classes/${classId}/book`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        refunded?: boolean;
      };
      setBooking(null);
      // WAITLIST nunca consumió → copy neutro. BOOKED refleja si la
      // clase volvió al plan o quedó consumida; asiento pagado → la
      // devolución del dinero es gestión manual, no del sistema.
      setNotice({
        text: !wasBooked
          ? t("cancelledOk")
          : paid
            ? t("cancelledPaid")
            : body.refunded === false
              ? t("cancelledNoRefund")
              : t("cancelledRefunded"),
        error: false,
      });
      router.refresh();
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Compra de clase suelta / taller (orderType WORKSHOP): crea la orden
   * y redirige a la pasarela — el asiento lo materializa el settle al
   * PAID (paymentId, sin consumir cuota del plan).
   */
  async function buy() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch("/checkout/class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId }),
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      const order = (await res.json()) as { paymentUrl?: string };
      if (!order.paymentUrl) {
        setNotice({ text: t("error"), error: true });
        return;
      }
      window.location.assign(order.paymentUrl);
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  const full = spotsLeft <= 0;
  // La compra suelta existe solo si hay precio y cupo (el backend la
  // rechaza con cupo agotado — el asiento cae a WAITLIST al settle).
  const buyable = dropInPrice != null && !full;
  const creditsLeft =
    myCredits?.limit != null && myCredits.used != null
      ? Math.max(myCredits.limit - myCredits.used, 0)
      : null;
  // Fuera del corte, cancelar libera el asiento pero consume el crédito.
  const refundable =
    !startsAtIso ||
    Date.now() <=
      new Date(startsAtIso).getTime() - cancelRefundMinutes * 60_000;

  if (closedLabel) {
    return (
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-night-700 bg-night-950/90 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6">
          <p className="text-center text-sm font-medium text-white/60">
            {closedLabel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Barra de acción fija — flota sobre la BottomNav (4rem + safe
          area), igual que la ficha de evento. Solo existe cuando hay
          acción: reservada/en espera → el estado va en los chips del
          header, no en la barra. */}
      {!booking && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-night-700 bg-night-950/90 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-4 sm:px-6">
            {notice && (
              <p
                role={notice.error ? "alert" : "status"}
                className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
              >
                {notice.text}
              </p>
            )}
            {!enrolled && !buyable ? (
              // Sin inscripción ni compra suelta: el escape es la ficha
              // de la academia, donde están los planes comprables — la
              // barra conserva la gramática info-izquierda / acción-derecha.
              <div className="flex items-center justify-between gap-4">
                <p className="min-w-0 text-sm text-white/60">
                  {t("requiresEnrollment")}
                </p>
                <Button
                  href={`/academias/${academyId}`}
                  className="shrink-0"
                >
                  {t("viewPlans")}
                </Button>
              </div>
            ) : !enrolled && buyable ? (
              // Sin inscripción pero la clase se vende suelta (taller):
              // la compra es la acción primaria; los planes quedan como
              // camino secundario (un plan rinde si vuelve seguido).
              <>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <span className="block text-xs uppercase tracking-wide text-white/50">
                      {t("dropIn")}
                    </span>
                    <PriceTag
                      amount={dropInPrice ?? 0}
                      className="text-lg"
                    />
                  </div>
                  <Button
                    disabled={busy}
                    onClick={() => void buy()}
                    className="shrink-0"
                  >
                    {t("buyClass")}
                  </Button>
                </div>
                <a
                  href={`/academias/${academyId}`}
                  className="text-xs text-white/50 underline-offset-4 hover:underline"
                >
                  {t("orViewPlans")}
                </a>
              </>
            ) : (
              <div className="flex items-center justify-between gap-4">
                {/* Cupo junto a la acción — la urgencia es referencia de
                    decisión, mismo patrón que el rail del ClassCard. */}
                <div className="min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-white/50">
                    {t("capacityLabel")}
                  </span>
                  {full ? (
                    <span className="text-sm font-semibold text-white/60">
                      {t("full")}
                      {waitlistCount > 0 && (
                        <span className="text-white/40">
                          {" "}
                          · {t("waitlistCount", { count: waitlistCount })}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      className={`text-lg font-semibold tabular-nums ${
                        spotsLeft <= 3 ? "text-amber-300" : "text-neon"
                      }`}
                    >
                      {spotsLeft} / {capacity}
                    </span>
                  )}
                  {/* Créditos del plan — referencia de decisión junto al
                      cupo; 0/0 no existe (sin cuota → myCredits null). */}
                  {creditsLeft != null && (
                    <span className="block text-xs text-white/50">
                      {myCredits?.kind === "PACK"
                        ? t("creditsPack", {
                            left: creditsLeft,
                            limit: myCredits.limit ?? 0,
                          })
                        : t("creditsWeekly", {
                            left: creditsLeft,
                            limit: myCredits?.limit ?? 0,
                          })}
                    </span>
                  )}
                </div>
                <Button
                  disabled={
                    busy || (!full && creditsLeft === 0 && !buyable)
                  }
                  onClick={() =>
                    void (creditsLeft === 0 && buyable ? buy() : book())
                  }
                  className="shrink-0"
                >
                  {full
                    ? t("joinWaitlist")
                    : creditsLeft === 0
                      ? buyable
                        ? t("buyClass")
                        : t("creditsExhausted")
                      : t("book")}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pie: aviso post-reserva + zona destructiva centrada — patrón
          "eliminar amigo": lejos del pulgar, la confirmación va en
          bottom sheet (no inline ni window.confirm). */}
      {booking && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {notice && (
            <p
              role={notice.error ? "alert" : "status"}
              className={`text-sm ${notice.error ? "text-red-400" : "text-neon"}`}
            >
              {notice.text}
            </p>
          )}
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
            {/* El copy declara la consecuencia antes de confirmar: dentro
                de la ventana el crédito vuelve al plan; fuera, el cupo
                se libera pero la clase se consume. */}
            <p className="text-sm text-white/70">
              {t("cancelConfirm")}{" "}
              {booking === "BOOKED" &&
                (paid
                  ? t("cancelPaid")
                  : refundable
                    ? t("cancelRefundable")
                    : t("cancelLate"))}
            </p>
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
