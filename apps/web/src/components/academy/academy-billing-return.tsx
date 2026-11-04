"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ActionNotice,
  type ActionNoticeData,
} from "@/components/ui/action-notice";

/**
 * Aviso del retorno de Flow para la suscripción de la academia (espejo
 * de pro-return-notice de Producer Pro): POST
 * /api/payments/flow/platform-customer-return redirige (303) a esta
 * consola /academia/configuracion/suscripcion?sub=ok|error.
 * La sub puede seguir ACTIVATING al aterrizar - copy "procesando".
 * El resultado se presenta con el patrón único post-acción
 * (ActionNotice): el param es del redirect del gateway, no de una
 * navegación interna.
 */
export function AcademyBillingReturnNotice() {
  const ts = useTranslations("subscriptions");
  const sub = useSearchParams().get("sub");
  const [dismissed, setDismissed] = useState(false);

  const notice = useMemo<ActionNoticeData | null>(() => {
    if (sub === "ok") return { text: ts("subOk") };
    if (sub === "error") return { text: ts("subError"), error: true };
    return null;
  }, [sub, ts]);

  if (dismissed) return null;
  return (
    <ActionNotice notice={notice} onDismiss={() => setDismissed(true)} />
  );
}
