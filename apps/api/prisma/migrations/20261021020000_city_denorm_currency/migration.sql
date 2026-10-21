-- Foundation slice 2: cityId denormalizado en Event/Academy (filtro
-- uniforme por ciudad incluyendo prácticas sin Venue) + currency en
-- Ticket/PlatformSubscription (spec multipais-foundation).
ALTER TABLE "Event" ADD COLUMN "cityId" TEXT;
ALTER TABLE "Academy" ADD COLUMN "cityId" TEXT;
ALTER TABLE "Ticket" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "PlatformSubscription" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';

ALTER TABLE "Event" ADD CONSTRAINT "Event_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Academy" ADD CONSTRAINT "Academy_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Event_cityId_idx" ON "Event"("cityId");
CREATE INDEX "Academy_cityId_idx" ON "Academy"("cityId");

UPDATE "Event" SET "cityId" = 'city-stgo-cl' WHERE "cityId" IS NULL;
UPDATE "Academy" SET "cityId" = 'city-stgo-cl' WHERE "cityId" IS NULL;
