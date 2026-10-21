-- Scoping regional de validación (spec multipais-foundation).
CREATE TABLE "AdminRegion" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "AdminRegion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminRegion_personId_cityId_key" ON "AdminRegion"("personId", "cityId");
ALTER TABLE "AdminRegion" ADD CONSTRAINT "AdminRegion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminRegion" ADD CONSTRAINT "AdminRegion_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
