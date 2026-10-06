CREATE TABLE "AcademyStaff" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "canStudents" BOOLEAN NOT NULL DEFAULT false,
    "canPayments" BOOLEAN NOT NULL DEFAULT false,
    "canPlans" BOOLEAN NOT NULL DEFAULT false,
    "canSchedule" BOOLEAN NOT NULL DEFAULT false,
    "canProfile" BOOLEAN NOT NULL DEFAULT false,
    "canTeam" BOOLEAN NOT NULL DEFAULT false,
    "canBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyStaff_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentClaim" ADD CONSTRAINT "PaymentClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AcademyStaff" ADD CONSTRAINT "AcademyStaff_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AcademyStaff_academyId_personId_key" ON "AcademyStaff"("academyId", "personId");
