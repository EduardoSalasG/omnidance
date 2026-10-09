"use client";

import { useTranslations } from "next-intl";
import { AcademyGate } from "@/components/academy/academy-gate";
import { AcademySettings } from "@/components/academy/academy-settings";
import { AcademyProfile } from "@/components/academy/academy-profile";
import { PaymentMethodsAdmin } from "@/components/academy/payment-methods-admin";
import { ConsoleHeader } from "@/components/console/console-header";

/**
 * /academia/configuracion - ajustes de la academia seleccionada (quórum
 * default y demás params operativos) + perfil público. Salieron del hub
 * /academia: son configuración, no operación diaria. El gate resuelve
 * auth + academia; cada sección se auto-gatea por su capacidad
 * (profile/billing) si el viewer no es owner.
 */
export default function AcademiaConfiguracionPage() {
  const t = useTranslations("academy");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <ConsoleHeader backHref="/academia" backLabel={t("title")} />
      <AcademyGate>
        {({ academy }) => (
          <div key={academy.id} className="flex flex-col gap-6">
            <AcademySettings academy={academy} />
            <PaymentMethodsAdmin academyId={academy.id} />
            <AcademyProfile academy={academy} />
          </div>
        )}
      </AcademyGate>
    </main>
  );
}
