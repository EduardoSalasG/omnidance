"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { Button, Card } from "@/components/ui";
import { readError } from "@/components/academy/shared";

/**
 * Zona destructiva de la ficha de una clase particular - el mismo
 * patrón que la cancelación de una reserva normal: lejos del pulgar,
 * confirmación en bottom sheet, nunca inline ni window.confirm. La
 * devolución del dinero es gestión manual (Flow) - el owner recibe
 * una notificación (academy.private_lesson.cancelled_paid).
 */
export function PrivateLessonCancelCta({ lessonId }: { lessonId: string }) {
  const tl = useTranslations("academyExtras.lessons");
  const t = useTranslations("classes");
  const tc = useTranslations("common");
  const router = useRouter();
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

  async function cancel() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await apiFetch(`/private-lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        setNotice({ text: (await readError(res)) ?? t("error"), error: true });
        return;
      }
      // La particular comprada se paga por adelantado - la devolución
      // es gestión manual con la academia (mismo copy que reserva paga).
      setNotice({ text: t("cancelledPaid"), error: false });
      router.refresh();
    } catch {
      setNotice({ text: t("error"), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Pie: aviso post-cancelación + zona destructiva centrada -
          patrón "eliminar amigo" / cancelar reserva. */}
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
          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
        >
          {tl("cancel")}
        </button>
      </div>

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
            aria-labelledby="cancel-lesson-title"
            className="w-full max-w-md space-y-4"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <h2 id="cancel-lesson-title" className="text-lg font-semibold">
              {tl("cancel")}
            </h2>
            {/* El copy declara la consecuencia antes de confirmar: la
                devolución del pago es gestión manual con la academia. */}
            <p className="text-sm text-white/70">
              {tl("confirmCancel")} {t("cancelPaid")}
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
                {tl("cancel")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
