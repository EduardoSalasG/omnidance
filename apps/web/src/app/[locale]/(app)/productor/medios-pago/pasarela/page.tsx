"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/me-context";
import { ProducerGate } from "@/components/producer/producer-gate";
import { ConsoleHeader } from "@/components/console/console-header";
import { GatewayAccountPanel } from "@/components/payments/gateway-account";

/**
 * /productor/medios-pago/pasarela - ficha de la cuenta de pasarela
 * BYO del productor (nivel 2 del listado unificado, change
 * gateway-in-methods-form): vista segura (mask + webhookUrl +
 * lastError), rotación de credenciales (PUT) y desactivar en zona roja
 * (DELETE - el cobro vuelve a la plataforma, spec
 * producer-gateway-accounts).
 */
export default function ProducerPasarelaPage() {
  const tp = useTranslations("producer");
  const t = useTranslations("academyPay");
  const { me } = useMe();
  const isProducer = me?.roles.includes("PRODUCER") ?? false;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 lg:max-w-none lg:px-4">
      <ConsoleHeader
        backHref="/productor/medios-pago"
        backLabel={tp("ownMethods.title")}
      />
      <ProducerGate>
        {isProducer ? (
          <GatewayAccountPanel
            endpoint="/producer/gateway-account"
            ns="producer.gateway"
            createHref="/productor/medios-pago/nuevo"
            createLabel={t("addMethod")}
          />
        ) : (
          <p className="text-sm text-ink/60">
            {tp("configPages.producerOnly")}
          </p>
        )}
      </ProducerGate>
    </main>
  );
}
