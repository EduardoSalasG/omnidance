-- Reviews verificadas de serie (spec series-engagement).
CREATE TABLE "SeriesReview" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeriesReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SeriesReview_seriesId_personId_key" ON "SeriesReview"("seriesId", "personId");
CREATE INDEX "SeriesReview_seriesId_idx" ON "SeriesReview"("seriesId");

ALTER TABLE "SeriesReview" ADD CONSTRAINT "SeriesReview_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "EventSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SeriesReview" ADD CONSTRAINT "SeriesReview_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
