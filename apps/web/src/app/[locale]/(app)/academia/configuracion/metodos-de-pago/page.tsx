"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademyGatewaySection } from "@/components/academy/gateway-account-section";
import { PaymentMethodsAdmin } from "@/components/academy/payment-methods-admin";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/configuracion/metodos-de-pago - cómo cobra la academia:
 * pasarela propia (spec academy-byo-collections: sus ventas van directo
 * a su cuenta y el take se factura mes vencido; sin cuenta la venta
 * online queda solo por comprobante) + medios de cobro directos
 * (transferencia/efectivo que el alumno elige al pagar). Misma
 * composición que /productor/medios-pago.
 */
export default function ConfigPagosPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <>
            <AcademyGatewaySection
              key={`gw-${academy.id}`}
              academyId={academy.id}
            />
            <PaymentMethodsAdmin key={academy.id} academyId={academy.id} />
          </>
        )}
      </AcademyGate>
    </main>
  );
}
