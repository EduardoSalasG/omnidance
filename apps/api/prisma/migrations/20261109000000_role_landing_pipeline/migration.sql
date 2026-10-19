-- role-registration-pipeline: SANDBOX fuera del enum (sus filas quedan
-- PENDING) y AuthOtp.role para el ?role= de las landings.
-- El default del enum viejo bloquea el cast → se suelta y se repone.

UPDATE "PersonRole" SET status = 'PENDING' WHERE status = 'SANDBOX';
ALTER TABLE "PersonRole" ALTER COLUMN status DROP DEFAULT;
ALTER TYPE "RoleStatus" RENAME TO "RoleStatus_old";
CREATE TYPE "RoleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "PersonRole" ALTER COLUMN status TYPE "RoleStatus"
  USING status::text::"RoleStatus";
ALTER TABLE "PersonRole" ALTER COLUMN status SET DEFAULT 'PENDING';
DROP TYPE "RoleStatus_old";

ALTER TABLE "AuthOtp" ADD COLUMN "role" TEXT;
