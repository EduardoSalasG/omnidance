"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { GatewayAccountPanel } from "@/components/payments/gateway-account";

/**
 * /academia/configuracion/metodos-de-pago/pasarela - ficha de la cuenta
 * de pasarela BYO (nivel 2 del listado unificado, change
 * gateway-in-methods-form): vista segura (mask + webhookUrl +
 * lastError), rotación de credenciales (PUT) y desactivar en zona roja
 * (DELETE - la venta online queda solo por comprobante, spec
 * academy-byo-collections).
 */
export default function GatewayAccountPage() {
  const t = useTranslations("academyPay");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-3 pb-6 sm:px-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/academia/configuracion/metodos-de-pago"
        backLabel={t("methodsAdminTitle")}
      />
      <AcademyGate>
        {({ academy }) => (
          <GatewayAccountPanel
            key={academy.id}
            endpoint={`/academies/${academy.id}/gateway-account`}
            ns="academyPay.gateway"
            createHref="/academia/configuracion/metodos-de-pago/nuevo"
            createLabel={t("addMethod")}
          />
        )}
      </AcademyGate>
    </main>
  );
}
