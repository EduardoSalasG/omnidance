import { BadRequestException } from "@nestjs/common";
import type { Person } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { SubscriptionCallOpts, SubscriptionProvider } from "../domain/ports";

/**
 * Customer remoto lazy por proveedor - compartido por las suscripciones
 * de membresía (`SubscriptionsService`) y las de plataforma
 * (`PlatformSubscriptionsService`): si la persona aún no tiene customer
 * para ESTE proveedor se crea (requiere email en la cuenta) y se
 * persiste el mapeo.
 *
 * Mapa `gatewayCustomerIds` (spec multipais-currency): cada provider
 * tiene su propio customer remoto (FLOW/CLP y STRIPE/USD no colisionan
 * como pasaba con la columna única). `flowCustomerId` se sigue
 * escribiendo como espejo cuando el provider es FLOW - la columna
 * queda correcta para lectores legacy y el customer-return; los
 * providers nuevos viven solo en el mapa.
 */
export async function ensureFlowCustomer(
  prisma: PrismaService,
  provider: SubscriptionProvider,
  providerName: string,
  personId: string,
  opts: SubscriptionCallOpts = {},
): Promise<{ person: Person; customerId: string }> {
  const person = await prisma.person.findUniqueOrThrow({
    where: { id: personId },
  });
  const key = providerName.toUpperCase();
  const map = (person.gatewayCustomerIds ?? null) as Record<
    string,
    unknown
  > | null;
  let customerId =
    typeof map?.[key] === "string" && map[key]
      ? (map[key] as string)
      : key === "FLOW"
        ? person.flowCustomerId // fila pre-migración sin backfill
        : null;
  if (!customerId) {
    if (!person.email) {
      throw new BadRequestException(
        "necesitas un email en tu cuenta para suscribirte",
      );
    }
    const c = await provider.createCustomer(
      { email: person.email, name: person.name, externalId: personId },
      opts,
    );
    customerId = c.customerId;
    await prisma.person.update({
      where: { id: personId },
      data: {
        gatewayCustomerIds: {
          ...((map as Record<string, string> | null) ?? {}),
          [key]: customerId,
        },
        // Espejo legacy: la columna sigue diciendo la verdad para FLOW.
        ...(key === "FLOW" ? { flowCustomerId: customerId } : {}),
      },
    });
  }
  return { person, customerId };
}
