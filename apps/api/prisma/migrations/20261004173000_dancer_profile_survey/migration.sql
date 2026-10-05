CREATE TYPE "Gender" AS ENUM ('M', 'F', 'OTHER');
ALTER TABLE "Person" ADD COLUMN "gender" "Gender";
ALTER TABLE "EventRating" ADD COLUMN "overall" INTEGER;
ALTER TABLE "Event" ADD COLUMN "surveyNotifiedAt" TIMESTAMP(3);
