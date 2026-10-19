-- AlterTable
ALTER TABLE "Academy" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "reviewStatus" "RoleStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill (spec academy-approval-gate): academias existentes quedan
-- APPROVED (grandfathered) para no vaciar el directorio público.
UPDATE "Academy" SET "reviewStatus" = 'APPROVED';
