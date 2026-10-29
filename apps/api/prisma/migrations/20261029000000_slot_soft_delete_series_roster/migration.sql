-- Borrado lógico de horarios: un slot con clases pasadas no puede
-- hard-deletearse (Class.slot es Restrict); conserva historial.
ALTER TABLE "ClassSlot" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Roster de instructores habilitados por serie: solo ellos son
-- asignables a los horarios (spec serie habilita -> slot asigna).
CREATE TABLE "ClassSeriesInstructor" (
    "seriesId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,

    CONSTRAINT "ClassSeriesInstructor_pkey" PRIMARY KEY ("seriesId", "personId")
);

ALTER TABLE "ClassSeriesInstructor"
    ADD CONSTRAINT "ClassSeriesInstructor_seriesId_fkey"
    FOREIGN KEY ("seriesId") REFERENCES "ClassSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassSeriesInstructor"
    ADD CONSTRAINT "ClassSeriesInstructor_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
