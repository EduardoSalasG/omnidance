"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ProducerProSection } from "@/components/producer/pro-section";
import { FeeParamsSection } from "@/components/producer/fee-params-section";
import { ProReturnNotice } from "@/components/producer/pro-return-notice";

/**
 * /productor/suscripcion - Producer Pro (contratación/gestión del plan)
 * + la comisión todo incluido que aplica a sus ventas (read-only: la
 * define el admin). El retorno del disclaimer Flow (?pro=ok) aterriza
 * acá - es donde se contrata el plan.
 */
export default function ProducerSuscripcionPage() {
  const tn = useTranslations("nav");
  const tp = useTranslations("producer");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-4xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <Suspense>
        <ProReturnNotice />
      </Suspense>
      <ProducerGate>
        {isProducer ? (
          <ProducerProSection producerId={me?.id ?? ""} />
        ) : (
          <p className="text-sm text-ink/60">
            {tp("configPages.producerOnly")}
          </p>
        )}
        <FeeParamsSection />
      </ProducerGate>
    </main>
  );
}
