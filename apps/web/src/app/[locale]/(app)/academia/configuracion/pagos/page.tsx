"use client";

import { AcademyGate } from "@/components/academy/academy-gate";
import { PaymentMethodsAdmin } from "@/components/academy/payment-methods-admin";

/**
 * /academia/configuracion/pagos - medios de cobro propios de la
 * academia (transferencia/efectivo que el alumno elige al pagar su
 * plan). Página raíz de la sección Configuración - sin back.
 */
export default function ConfigPagosPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6 lg:max-w-4xl lg:px-8">
      <AcademyGate>
        {({ academy }) => (
          <PaymentMethodsAdmin key={academy.id} academyId={academy.id} />
        )}
      </AcademyGate>
    </main>
  );
}
