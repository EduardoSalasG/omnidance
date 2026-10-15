"use client";

import { useTranslations } from "next-intl";
import { ConsoleHeader } from "@/components/console/console-header";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ProducerClaimsQueue } from "@/components/producer/claims-queue-section";

/**
 * /productor/comprobantes - cola de comprobantes de los métodos
 * propios (spec producer-own-methods): el comprador paga por
 * transferencia/link/efectivo y sube la evidencia; al aprobar, la
 * orden se liquida y la entrada queda emitida.
 */
export default function ProducerClaimsPage() {
  const t = useTranslations("producer");
  const tn = useTranslations("nav");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-5xl lg:px-8">
      <ConsoleHeader backHref="/inicio" backLabel={tn("home")} />
      <ProducerGate>
        <ProducerClaimsQueue />
      </ProducerGate>
    </main>
  );
}
