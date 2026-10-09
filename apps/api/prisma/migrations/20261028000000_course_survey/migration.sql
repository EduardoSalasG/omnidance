-- Encuesta mensual curso+profe: una por alumno x serie x mes.
CREATE TABLE "CourseSurvey" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "instructorId" TEXT,
    "month" TEXT NOT NULL,
    "courseRating" INTEGER NOT NULL,
    "instructorRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseSurvey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseSurvey_personId_seriesId_month_key" ON "CourseSurvey"("personId", "seriesId", "month");
CREATE INDEX "CourseSurvey_academyId_seriesId_month_idx" ON "CourseSurvey"("academyId", "seriesId", "month");
CREATE INDEX "CourseSurvey_academyId_instructorId_idx" ON "CourseSurvey"("academyId", "instructorId");
