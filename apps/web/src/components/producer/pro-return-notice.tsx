"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Aviso del retorno de Flow para la suscripción Producer Pro:
 * POST /api/payments/flow/platform-customer-return redirige (303) a
 * /productor?pro=ok cuando el registro de tarjeta + alta de la sub
 * salen bien. El error resoluble a productor no existe (la falla del
 * disclaimer no identifica al pagador — cae en /perfil?sub=error).
 * La sub puede seguir ACTIVATING al aterrizar — copy procesando.
 */
export function ProReturnNotice() {
  const ts = useTranslations("subscriptions");
  const pro = useSearchParams().get("pro");

  if (pro === "ok") {
    return (
      <p role="status" className="text-sm text-neon">
        {ts("subOk")}
      </p>
    );
  }
  if (pro === "error") {
    return (
      <p role="alert" className="text-sm text-red-400">
        {ts("subError")}
      </p>
    );
  }
  return null;
}
