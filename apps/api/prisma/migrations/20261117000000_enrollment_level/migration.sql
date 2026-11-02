-- CreateTable
CREATE TABLE "EnrollmentLevel" (
    "enrollmentId" TEXT NOT NULL,
    "classTypeId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,

    CONSTRAINT "EnrollmentLevel_pkey" PRIMARY KEY ("enrollmentId","classTypeId","levelId")
);

-- AddForeignKey
ALTER TABLE "EnrollmentLevel" ADD CONSTRAINT "EnrollmentLevel_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentLevel" ADD CONSTRAINT "EnrollmentLevel_classTypeId_fkey" FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentLevel" ADD CONSTRAINT "EnrollmentLevel_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
