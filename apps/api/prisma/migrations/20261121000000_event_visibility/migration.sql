-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'INTERNAL_ACADEMY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';
