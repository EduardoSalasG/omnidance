-- Normaliza photoUrl con folder duplicado (bug v1.3.1): las rutas
-- compat ya los sirven, pero el formato canónico es sin duplicar.
UPDATE "Person"
SET "photoUrl" = replace("photoUrl", '/api/people/photos/people-photos/', '/api/people/photos/')
WHERE "photoUrl" LIKE '/api/people/photos/people-photos/%';

UPDATE "Person"
SET "photoUrl" = replace("photoUrl", '/api/academies/photos/academy-photos/', '/api/academies/photos/')
WHERE "photoUrl" LIKE '/api/academies/photos/academy-photos/%';

UPDATE "Academy"
SET "photoUrl" = replace("photoUrl", '/api/academies/photos/academy-photos/', '/api/academies/photos/')
WHERE "photoUrl" LIKE '/api/academies/photos/academy-photos/%';

UPDATE "Academy"
SET "photoUrl" = replace("photoUrl", '/api/people/photos/people-photos/', '/api/people/photos/')
WHERE "photoUrl" LIKE '/api/people/photos/people-photos/%';
