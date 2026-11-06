"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { PaymentMethodsAdmin } from "@/components/academy/payment-methods-admin";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/configuracion/metodos-de-pago - medios de cobro propios de la
 * academia (transferencia/efectivo que el alumno elige al pagar su
 * plan). Destino directo del drawer: el ConsoleHeader declara el back
 * al hub.
 */
export default function ConfigPagosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <PaymentMethodsAdmin key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}
