-- Fundación multipaís (spec multipais-foundation): Country/City,
-- Venue.cityId, Event.currency, Person.phoneCountryCode.
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Country_code_key" ON "Country"("code");

CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'America/Santiago',
    "geohash" TEXT,
    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");
CREATE UNIQUE INDEX "City_countryId_name_key" ON "City"("countryId", "name");

ALTER TABLE "Venue" ADD COLUMN "cityId" TEXT;
ALTER TABLE "Event" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CLP';
ALTER TABLE "Person" ADD COLUMN "phoneCountryCode" TEXT;

ALTER TABLE "City" ADD CONSTRAINT "City_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: todo lo existente pertenece a Santiago, Chile (ciudad 0).
INSERT INTO "Country" ("id", "code", "name")
VALUES ('country-cl', 'CL', 'Chile')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "City" ("id", "countryId", "name", "slug", "lat", "lng", "timezone", "geohash")
VALUES ('city-stgo-cl', 'country-cl', 'Santiago', 'santiago-cl', -33.4489, -70.6693, 'America/Santiago', '66rcc')
ON CONFLICT ("slug") DO NOTHING;

UPDATE "Venue" SET "cityId" = 'city-stgo-cl' WHERE "cityId" IS NULL;
