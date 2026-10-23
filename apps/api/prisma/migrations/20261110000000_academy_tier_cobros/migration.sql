-- academy-tier-cobros: nuevo valor COBROS en AcademyTier (cobranza pura,
-- omni-dance.md §10). STARTER queda como legado - las cuentas existentes
-- resuelven a nivel STUDIO en la matriz de entitlements (nadie baja a
-- COBROS) y no se reescribe ninguna fila (la migración de suscripciones
-- vigentes a los tiers nuevos es trabajo comercial aparte).
ALTER TYPE "AcademyTier" ADD VALUE IF NOT EXISTS 'COBROS';
