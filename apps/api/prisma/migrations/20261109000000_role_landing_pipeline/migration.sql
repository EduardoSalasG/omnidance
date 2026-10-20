-- role-registration-pipeline: SANDBOX fuera del enum (sus filas quedan
-- PENDING) y AuthOtp.role para el ?role= de las landings.
-- El default del enum viejo bloquea el cast → se suelta y se repone.

UPDATE "PersonRole" SET status = 'PENDING' WHERE status = 'SANDBOX';
ALTER TABLE "PersonRole" ALTER COLUMN status DROP DEFAULT;
-- Academy.reviewStatus (academy_review_gate, 19-oct) también usa el enum
-- cuando la migración corre en una DB fresca - hay que re-tiparla igual.
ALTER TABLE "Academy" ALTER COLUMN "reviewStatus" DROP DEFAULT;
ALTER TYPE "RoleStatus" RENAME TO "RoleStatus_old";
CREATE TYPE "RoleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "PersonRole" ALTER COLUMN status TYPE "RoleStatus"
  USING status::text::"RoleStatus";
ALTER TABLE "PersonRole" ALTER COLUMN status SET DEFAULT 'PENDING';
ALTER TABLE "Academy" ALTER COLUMN "reviewStatus" TYPE "RoleStatus"
  USING "reviewStatus"::text::"RoleStatus";
ALTER TABLE "Academy" ALTER COLUMN "reviewStatus" SET DEFAULT 'PENDING';
DROP TYPE "RoleStatus_old";

ALTER TABLE "AuthOtp" ADD COLUMN "role" TEXT;
