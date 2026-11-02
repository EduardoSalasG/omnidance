"use client";

import { useState } from "react";

import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { ConfirmSheet } from "@/components/ui/confirm-sheet";
import { ActionNotice } from "@/components/ui/action-notice";
import { readError } from "@/components/academy/shared";
import { useRouter } from "@/i18n/navigation";

/**
 * Zona destructiva de la ficha de una clase particular - el mismo
 * patrón que la cancelación de una reserva normal: lejos del pulgar,
 * confirmación en bottom sheet, nunca inline ni window.confirm. La
 * devolución del dinero es gestión manual (Flow) - el owner recibe
 * una notificación (academy.private_lesson.cancelled_paid).
 *
 * La página lo monta SIEMPRE (con `cancellable` según el status): si
 * se condiciona afuera, el router.refresh() post-cancel desmonta el
 * componente y el aviso de éxito nunca se ve.
 */
export function PrivateLessonCancelCta({
  lessonId,
  cancellable,
}: {
  lessonId: string;
  /** Solo REQUESTED/CONFIRMED muestran la zona destructiva. */
  cancellable: boolean;
}) {
  const tl = useTranslations("academyExtras.lessons");
  const t = useTranslations("classes");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );

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
      {/* Aviso post-cancelación fijo - vive fuera del condicional de
          `cancellable` para sobrevivir al refresh (la particular pasa
          a CANCELLED y la zona destructiva desaparece). */}
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      {/* Pie: zona destructiva centrada - patrón "eliminar amigo" /
          cancelar reserva. */}
      {cancellable && (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-red-400/80 transition-colors hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-neon"
          >
            {tl("cancel")}
          </button>
        </div>
      )}

      {/* El copy declara la consecuencia antes de confirmar: la
          devolución del pago es gestión manual con la academia. */}
      <ConfirmSheet
        open={confirming}
        title={tl("cancel")}
        description={`${tl("confirmCancel")} ${t("cancelPaid")}`}
        confirmLabel={tl("cancel")}
        busy={busy}
        onConfirm={() => {
          setConfirming(false);
          void cancel();
        }}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
