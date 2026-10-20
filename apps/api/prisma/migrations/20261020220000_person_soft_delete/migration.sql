-- Soft delete de personas: baja lógica, el grafo de datos queda intacto.
ALTER TABLE "Person" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Person_deletedAt_idx" ON "Person"("deletedAt");
