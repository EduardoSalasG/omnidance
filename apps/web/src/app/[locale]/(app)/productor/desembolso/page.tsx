"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { DisbursementAccountSection } from "@/components/producer/disbursement-account-section";

/**
 * /productor/desembolso - dónde le paga la plataforma al productor:
 * cuenta de desembolso (Stripe Connect Express) dentro de la sección
 * Configuración (spec producer-pro). El onboarding vuelve acá y el
 * GET hace el flip PENDING→ACTIVE.
 */
export default function ProducerDesembolsoPage() {
  const tn = useTranslations("nav");
  const tp = useTranslations("producer");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-4xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        {isProducer ? (
          <DisbursementAccountSection />
        ) : (
          <p className="text-sm text-ink/60">
            {tp("configPages.producerOnly")}
          </p>
        )}
      </ProducerGate>
    </main>
  );
}
