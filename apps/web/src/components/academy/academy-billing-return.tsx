"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Aviso del retorno de Flow para la suscripción de la academia (espejo
 * de pro-return-notice de Producer Pro): hoy POST
 * /api/payments/flow/platform-customer-return redirige (303) a la ficha
 * pública /academias/:id?sub=ok|error — si el callback apunta a la
 * consola (/academia/suscripcion?sub=…) este aviso ya da el feedback.
 * La sub puede seguir ACTIVATING al aterrizar — copy "procesando".
 */
export function AcademyBillingReturnNotice() {
  const ts = useTranslations("subscriptions");
  const sub = useSearchParams().get("sub");

  if (sub === "ok") {
    return (
      <p role="status" className="text-sm text-neon">
        {ts("subOk")}
      </p>
    );
  }
  if (sub === "error") {
    return (
      <p role="alert" className="text-sm text-red-400">
        {ts("subError")}
      </p>
    );
  }
  return null;
}
