-- Niveles custom por academia: academyId null = linea global por
-- defecto; la unique compuesta deja de exigir name unico global
-- (dos academias pueden llamar igual sus niveles).

-- AlterTable
ALTER TABLE "ClassLevel" ADD COLUMN "academyId" TEXT;

-- DropIndex (name ya no es unique a nivel global)
DROP INDEX "ClassLevel_name_key";

-- CreateIndex (compound con el mismo orden que @@unique([academyId, name]))
CREATE UNIQUE INDEX "ClassLevel_academyId_name_key" ON "ClassLevel"("academyId", "name");

-- AddForeignKey
ALTER TABLE "ClassLevel" ADD CONSTRAINT "ClassLevel_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
