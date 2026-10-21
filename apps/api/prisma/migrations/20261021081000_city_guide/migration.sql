-- CreateTable
CREATE TABLE "CityGuide" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "intro" TEXT NOT NULL DEFAULT '',
    "nightlife" TEXT NOT NULL DEFAULT '',
    "practical" TEXT NOT NULL DEFAULT '',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CityGuide_cityId_key" ON "CityGuide"("cityId");

-- AddForeignKey
ALTER TABLE "CityGuide" ADD CONSTRAINT "CityGuide_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
