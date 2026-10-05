import { BadRequestException } from "@nestjs/common";
import type { Person } from "@prisma/client";
import type { PrismaService } from "../../prisma.service";
import type { SubscriptionCallOpts, SubscriptionProvider } from "../domain/ports";

/**
 * Customer Flow lazy - compartido por las suscripciones de membresía
 * (`SubscriptionsService`) y las de plataforma (`PlatformSubscriptionsService`):
 * si la persona aún no tiene `flowCustomerId` se crea el customer remoto
 * (requiere email en la cuenta) y se persiste el mapeo. El customer es
 * único por persona y sirve para cualquier suscripción suya.
 */
export async function ensureFlowCustomer(
  prisma: PrismaService,
  provider: SubscriptionProvider,
  personId: string,
  opts: SubscriptionCallOpts = {},
): Promise<{ person: Person; customerId: string }> {
  const person = await prisma.person.findUniqueOrThrow({
    where: { id: personId },
  });
  let customerId = person.flowCustomerId;
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
      data: { flowCustomerId: customerId },
    });
  }
  return { person, customerId };
}
