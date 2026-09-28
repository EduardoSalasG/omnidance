-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "enrollmentId" TEXT,
ADD COLUMN     "refunded" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MembershipPlan" ADD COLUMN     "weeklyClasses" INTEGER;
