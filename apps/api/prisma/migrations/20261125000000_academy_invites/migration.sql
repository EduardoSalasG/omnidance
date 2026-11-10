-- AlterTable
ALTER TABLE "AuthOtp" ADD COLUMN     "next" TEXT;

-- CreateTable
CREATE TABLE "AcademyInvite" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "personId" TEXT,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademyInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademyInvite_academyId_email_idx" ON "AcademyInvite"("academyId", "email");

-- AddForeignKey
ALTER TABLE "AcademyInvite" ADD CONSTRAINT "AcademyInvite_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

