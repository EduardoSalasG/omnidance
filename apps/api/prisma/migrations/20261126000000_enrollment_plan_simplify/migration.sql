-- enrollment-plan-simplify: estados binarios + PlanType sin TRIAL +
-- drop pausedAt. El mapeo de valores va dentro del USING del swap de
-- enum (los valores viejos no castearían al enum nuevo):
--   TRIAL/ONLINE -> ACTIVE (hoy bookables), PAUSED/FROZEN -> INACTIVE.
--   Plan TRIAL -> CLASS_PACK con classCount 1 ("clase de prueba" =
--   pack de 1 clase; null la dejaría ilimitada).
UPDATE "MembershipPlan" SET "classCount" = COALESCE("classCount", 1) WHERE "type" = 'TRIAL';

-- AlterEnum
BEGIN;
CREATE TYPE "EnrollmentStatus_new" AS ENUM ('ACTIVE', 'INACTIVE');
ALTER TABLE "Enrollment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Enrollment" ALTER COLUMN "status" TYPE "EnrollmentStatus_new" USING ((CASE WHEN "status"::text IN ('PAUSED', 'FROZEN') THEN 'INACTIVE' ELSE 'ACTIVE' END)::"EnrollmentStatus_new");
ALTER TYPE "EnrollmentStatus" RENAME TO "EnrollmentStatus_old";
ALTER TYPE "EnrollmentStatus_new" RENAME TO "EnrollmentStatus";
DROP TYPE "EnrollmentStatus_old";
ALTER TABLE "Enrollment" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PlanType_new" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'SINGLE', 'CLASS_PACK', 'PERIOD');
ALTER TABLE "MembershipPlan" ALTER COLUMN "type" TYPE "PlanType_new" USING ((CASE WHEN "type"::text = 'TRIAL' THEN 'CLASS_PACK' ELSE "type"::text END)::"PlanType_new");
ALTER TYPE "PlanType" RENAME TO "PlanType_old";
ALTER TYPE "PlanType_new" RENAME TO "PlanType";
DROP TYPE "PlanType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Enrollment" DROP COLUMN "pausedAt";
