-- CreateTable
CREATE TABLE "AcademyImportRun" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT,
    "total" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyImportRun_academyId_createdAt_idx" ON "AcademyImportRun"("academyId", "createdAt");

-- AddForeignKey
ALTER TABLE "AcademyImportRun" ADD CONSTRAINT "AcademyImportRun_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Saneamiento enrollment sin plan (spec academies/enrollment-model):
-- las inscripciones ACTIVE sin planId (legado/import) regalaban cuota
-- ilimitada sin vencer - pasan a INACTIVE (reactivación manual staff).
UPDATE "Enrollment" SET "status" = 'INACTIVE' WHERE "planId" IS NULL AND "status" = 'ACTIVE';
