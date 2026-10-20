-- Niveles autodeclarados de baile: principiante -> basico
-- (escala Iniciación/Básico/Intermedio/Avanzado, misma del catálogo ClassLevel)
UPDATE "PersonStyleRole" SET "level" = 'basico' WHERE "level" = 'principiante';
