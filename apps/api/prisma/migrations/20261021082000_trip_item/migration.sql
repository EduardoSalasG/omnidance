-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TripItem_personId_idx" ON "TripItem"("personId");
CREATE UNIQUE INDEX "TripItem_personId_eventId_key" ON "TripItem"("personId", "eventId");

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
