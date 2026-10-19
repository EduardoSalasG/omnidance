-- CreateTable
CREATE TABLE "AcademySegmentSnapshot" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "segments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademySegmentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademySegmentSnapshot_academyId_weekStart_key" ON "AcademySegmentSnapshot"("academyId", "weekStart");

-- CreateIndex
CREATE INDEX "AcademySegmentSnapshot_academyId_idx" ON "AcademySegmentSnapshot"("academyId");

-- AddForeignKey
ALTER TABLE "AcademySegmentSnapshot" ADD CONSTRAINT "AcademySegmentSnapshot_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
