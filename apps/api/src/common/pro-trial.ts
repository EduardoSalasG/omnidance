// Otorgamiento del trial Producer Pro (spec platform-trials): al
// aprobarse PersonRole(PRODUCER) - cola de validación o grant directo
// de admin - `proTrialEndsAt = now + producer_pro.trial_days` (param,
// default 15). El tier efectivo PRO_STARTER lo deriva
// producerEffectiveTier/producerEntitlement, no se escribe a mano.
//
// No reinicia: salta si la persona ya tiene trial vigente o
// suscripción Pro viva (un churned que vuelve al rol no recobra trial;
// un actor pagando nunca lo necesitó).
import type { Prisma } from "@prisma/client";
import type { ParamsService } from "../params/params.service";
import { PLATFORM_SUB_LIVE_STATUSES } from "../payments/domain/platform-tiers";
import { emitActivity } from "./activity-log";

type TrialTx = Pick<
  Prisma.TransactionClient,
  "person" | "platformSubscription" | "activityEvent"
>;

/** Devuelve la fecha fin otorgada o null si no correspondía. */
export async function grantProducerTrialIfDue(
  tx: TrialTx,
  params: ParamsService,
  personId: string,
  via: string,
): Promise<Date | null> {
  const person = await tx.person.findUnique({
    where: { id: personId },
    select: { proTrialEndsAt: true },
  });
  if (!person) return null;
  const now = new Date();
  if (person.proTrialEndsAt != null && person.proTrialEndsAt > now) {
    return null;
  }
  const liveSub = await tx.platformSubscription.findFirst({
    where: {
      kind: "PRODUCER",
      producerId: personId,
      status: { in: [...PLATFORM_SUB_LIVE_STATUSES] },
    },
    select: { id: true },
  });
  if (liveSub) return null;
  const days = await params.getNumber("producer_pro.trial_days", 15);
  const endsAt = new Date(now.getTime() + days * 86_400_000);
  await tx.person.update({
    where: { id: personId },
    data: { proTrialEndsAt: endsAt },
  });
  await emitActivity(tx, {
    type: "trial.started",
    personId,
    data: { actor: "PRODUCER", via, days, endsAt },
  });
  return endsAt;
}
