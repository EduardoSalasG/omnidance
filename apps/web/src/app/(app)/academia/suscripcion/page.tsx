"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyBilling } from "@/components/academy/academy-billing";
import { AcademyBillingReturnNotice } from "@/components/academy/academy-billing-return";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/suscripcion - billing SaaS de la academia seleccionada
 * (GET /academies/:id/billing - owner/admin; 403 → "sin acceso" adentro).
 * El gate resuelve auth + academia; AcademyBilling maneja estado,
 * contratación (Flow), cambio de plan, cancelación e invoices.
 * El Suspense envuelve el aviso de retorno de Flow (?sub=ok|error -
 * useSearchParams) y el panel.
 */
export default function AcademiaSuscripcionPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <Suspense fallback={null}>
        <AcademyBillingReturnNotice />
      </Suspense>
      <AcademyGate>
        {({ academy }) => (
          <AcademyBilling key={academy.id} academy={academy} />
        )}
      </AcademyGate>
    </main>
  );
}
