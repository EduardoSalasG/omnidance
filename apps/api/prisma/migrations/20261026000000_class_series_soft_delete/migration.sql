-- Borrado lógico de ClassSeries: la consola las excluye (GET /series)
-- pero siguen existiendo para analítica y auditoría.
ALTER TABLE "ClassSeries" ADD COLUMN "deletedAt" TIMESTAMP(3);
