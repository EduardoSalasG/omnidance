"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { GatewayAccountSection } from "@/components/producer/gateway-account-section";
import { ProducerPaymentMethodsSection } from "@/components/producer/payment-methods-section";

/**
 * /productor/medios-pago - cómo cobra el productor: pasarela propia
 * (cuenta Flow/MP cifrada que cobra sus ventas; sin cuenta, la
 * plataforma cobra por el default MANAGED) + medios de cobro directos
 * (transferencia/link/efectivo elegibles en el checkout; los
 * comprobantes se validan en /productor/comprobantes).
 */
export default function ProducerMediosPagoPage() {
  const tn = useTranslations("nav");
  const tp = useTranslations("producer");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-4xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        {isProducer ? (
          <>
            <GatewayAccountSection />
            <ProducerPaymentMethodsSection />
          </>
        ) : (
          <p className="text-sm text-ink/60">
            {tp("configPages.producerOnly")}
          </p>
        )}
      </ProducerGate>
    </main>
  );
}
