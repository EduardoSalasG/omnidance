"use client";

import { useTranslations } from "next-intl";
import { BackLink } from "@/components/ui";
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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <BackLink href="/productor">{t("title")}</BackLink>
      <ProducerGate>
        <ProducerClaimsQueue />
      </ProducerGate>
    </main>
  );
}
