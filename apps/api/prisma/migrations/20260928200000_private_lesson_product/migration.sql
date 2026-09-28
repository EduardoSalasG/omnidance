ALTER TABLE "Academy" ADD COLUMN "privateLessonPrice" INTEGER;
ALTER TABLE "PrivateLesson" ALTER COLUMN "instructorId" DROP NOT NULL;
ALTER TABLE "PrivateLesson" ALTER COLUMN "scheduledAt" DROP NOT NULL;
ALTER TABLE "PrivateLesson" ADD COLUMN "paymentId" TEXT;
