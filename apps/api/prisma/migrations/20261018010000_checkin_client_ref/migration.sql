-- AlterTable
ALTER TABLE "Checkin" ADD COLUMN "clientRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Checkin_clientRef_key" ON "Checkin"("clientRef");
