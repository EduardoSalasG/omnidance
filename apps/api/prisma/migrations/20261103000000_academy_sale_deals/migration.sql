-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "soldByAcademyId" TEXT,
ADD COLUMN     "academyCommissionClp" INTEGER;

-- CreateTable
CREATE TABLE "AcademySaleAgreement" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "seriesId" TEXT,
    "academyId" TEXT NOT NULL,
    "commissionPct" INTEGER NOT NULL,
    "maxTickets" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "createdById" TEXT NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademySaleAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySaleSettlement" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "eventId" TEXT,
    "producerId" TEXT NOT NULL,
    "amountDue" INTEGER NOT NULL,
    "evidenceUrl" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademySaleSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademySaleAgreement_eventId_academyId_key" ON "AcademySaleAgreement"("eventId", "academyId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySaleAgreement_seriesId_academyId_key" ON "AcademySaleAgreement"("seriesId", "academyId");

-- CreateIndex
CREATE INDEX "AcademySaleSettlement_agreementId_idx" ON "AcademySaleSettlement"("agreementId");

-- CreateIndex
CREATE INDEX "Payment_soldByAcademyId_idx" ON "Payment"("soldByAcademyId");

-- AddForeignKey
ALTER TABLE "AcademySaleAgreement" ADD CONSTRAINT "AcademySaleAgreement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySaleAgreement" ADD CONSTRAINT "AcademySaleAgreement_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySaleAgreement" ADD CONSTRAINT "AcademySaleAgreement_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySaleSettlement" ADD CONSTRAINT "AcademySaleSettlement_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "AcademySaleAgreement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
