-- Backfill de datos (spec multipais-phone P4): Person.phoneCountryCode
-- y normalización E.164 de Person.phone. Todo lo existente pertenece a
-- la escena de Santiago → +56 implícito. Sin columnas nuevas.
--
-- Pre-check de duplicados post-normalización (reportar al handoff si >0):
--   WITH cand AS (
--     SELECT id,
--       CASE
--         WHEN phone ~ '^56[0-9]{9}$' THEN '+' || phone
--         WHEN phone ~ '^[0-9]{9}$' THEN '+56' || phone
--       END AS e164
--     FROM "Person"
--     WHERE phone IS NOT NULL AND phone NOT LIKE '+%'
--   )
--   SELECT e164, COUNT(*)
--   FROM cand
--   WHERE e164 IS NOT NULL
--   GROUP BY e164
--   HAVING COUNT(*) > 1
--   UNION ALL
--   SELECT c.e164, COUNT(*)
--   FROM cand c
--   JOIN "Person" q ON q.phone = c.e164
--   GROUP BY c.e164;

-- 1) País del teléfono: toda fila con phone y sin código es +56 implícita.
UPDATE "Person"
SET "phoneCountryCode" = 'CL'
WHERE "phone" IS NOT NULL AND "phoneCountryCode" IS NULL;

-- 2) phone → E.164: los que ya traen "+" quedan igual; 9 dígitos
--    (912345678) anteponen "+56"; 56-prefijo sin "+" (56912345678)
--    anteponen "+". Solo se normalizan filas SIN colisión sobre el
--    @unique: las que chocan con un phone existente o entre sí quedan
--    intactas y se reportan manualmente.
WITH cand AS (
  SELECT id,
    CASE
      WHEN phone ~ '^56[0-9]{9}$' THEN '+' || phone
      WHEN phone ~ '^[0-9]{9}$' THEN '+56' || phone
    END AS e164
  FROM "Person"
  WHERE "phone" IS NOT NULL AND "phone" NOT LIKE '+%'
),
dup AS (
  SELECT e164
  FROM cand
  WHERE e164 IS NOT NULL
  GROUP BY e164
  HAVING COUNT(*) > 1
)
UPDATE "Person" p
SET "phone" = c.e164
FROM cand c
WHERE p.id = c.id
  AND c.e164 IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM dup d WHERE d.e164 = c.e164)
  AND NOT EXISTS (
    SELECT 1 FROM "Person" q WHERE q."phone" = c.e164 AND q.id <> p.id
  );
