-- Regularización de drift: estas migraciones históricas crean índices que
-- la DB local perdió (db push temprano) y que el schema volvió a declarar.
-- IF NOT EXISTS: seguro en DBs drifted y en deploys fresh (donde las
-- migraciones originales ya los crearon).
CREATE INDEX IF NOT EXISTS "Person_deletedAt_idx" ON "Person"("deletedAt");
CREATE INDEX IF NOT EXISTS "Event_cityId_idx" ON "Event"("cityId");
CREATE INDEX IF NOT EXISTS "Academy_cityId_idx" ON "Academy"("cityId");
CREATE INDEX IF NOT EXISTS "PayoutLine_payoutId_idx" ON "PayoutLine"("payoutId");
CREATE INDEX IF NOT EXISTS "PayoutLine_paymentId_idx" ON "PayoutLine"("paymentId");
