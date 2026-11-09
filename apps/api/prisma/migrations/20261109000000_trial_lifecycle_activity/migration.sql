-- AlterTable
ALTER TABLE "Academy" ADD COLUMN     "trialEndNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "proTrialEndNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "academyId" TEXT,
    "type" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_personId_createdAt_idx" ON "ActivityEvent"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_academyId_createdAt_idx" ON "ActivityEvent"("academyId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_createdAt_idx" ON "ActivityEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

