"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ProducerPaymentMethodsSection } from "@/components/producer/payment-methods-section";

/**
 * /productor/medios-pago - cómo cobra el productor: lista unificada
 * (change gateway-in-methods-form): la pasarela propia (cuenta Flow/MP
 * cifrada que cobra sus ventas; sin cuenta, la plataforma cobra por el
 * default MANAGED) se agrega desde "Agregar método" y aparece como un
 * medio más (ficha /medios-pago/pasarela) + medios de cobro directos
 * (transferencia/link/efectivo elegibles en el checkout; los
 * comprobantes se validan en /productor/comprobantes).
 */
export default function ProducerMediosPagoPage() {
  const tn = useTranslations("nav");
  const tp = useTranslations("producer");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-none lg:px-4">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        {isProducer ? (
          <ProducerPaymentMethodsSection />
        ) : (
          <p className="text-sm text-ink/60">
            {tp("configPages.producerOnly")}
          </p>
        )}
      </ProducerGate>
    </main>
  );
}
