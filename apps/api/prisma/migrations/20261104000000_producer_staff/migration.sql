-- CreateTable
CREATE TABLE "ProducerStaff" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProducerStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProducerStaff_producerId_personId_key" ON "ProducerStaff"("producerId", "personId");

-- CreateIndex
CREATE INDEX "ProducerStaff_personId_idx" ON "ProducerStaff"("personId");
