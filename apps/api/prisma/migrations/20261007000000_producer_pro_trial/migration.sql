-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "proTrialEndsAt" TIMESTAMP(3);

-- Backfill (spec academy-saas-billing, S5): los productores registrados
-- reciben un trial de lanzamiento de 90 días — ninguna feature que ya
-- usaban se bloquea al desplegar el gating Pro. El criterio es
-- ProducerParams: existe una fila por productor que pasó por onboarding
-- de consola (más preciso que EventSeries.producerId, que también
-- incluye productores aún sin consola).
UPDATE "Person"
SET "proTrialEndsAt" = now() + interval '90 days'
WHERE "proTrialEndsAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "ProducerParams"
    WHERE "ProducerParams"."producerId" = "Person"."id"
  );
