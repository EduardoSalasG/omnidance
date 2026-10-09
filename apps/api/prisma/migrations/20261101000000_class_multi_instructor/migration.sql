-- Plantel multi-profesor: una clase puede ser dictada por N
-- instructores. ClassSlotInstructor = plantel del horario;
-- ClassInstructor = plantel materializado de cada instancia.
-- instructorId se conserva como instructor principal (comisión,
-- encuesta, liquidación leen el singular) y también figura en el join.
CREATE TABLE "ClassSlotInstructor" (
    "slotId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "ClassSlotInstructor_pkey" PRIMARY KEY ("slotId", "personId")
);

CREATE TABLE "ClassInstructor" (
    "classId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    CONSTRAINT "ClassInstructor_pkey" PRIMARY KEY ("classId", "personId")
);

ALTER TABLE "ClassSlotInstructor"
    ADD CONSTRAINT "ClassSlotInstructor_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "ClassSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassSlotInstructor"
    ADD CONSTRAINT "ClassSlotInstructor_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClassInstructor"
    ADD CONSTRAINT "ClassInstructor_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "Class"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClassInstructor"
    ADD CONSTRAINT "ClassInstructor_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "Person"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: el instructor principal existente entra al plantel
-- (el join es el conjunto completo, incluido el primario).
INSERT INTO "ClassSlotInstructor" ("slotId", "personId")
    SELECT "id", "instructorId" FROM "ClassSlot"
    WHERE "instructorId" IS NOT NULL
    ON CONFLICT DO NOTHING;

INSERT INTO "ClassInstructor" ("classId", "personId")
    SELECT "id", "instructorId" FROM "Class"
    WHERE "instructorId" IS NOT NULL
    ON CONFLICT DO NOTHING;
