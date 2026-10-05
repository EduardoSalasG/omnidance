#!/bin/sh
# Entrypoint del API en producción (Neon + Docker):
#   1. prisma migrate deploy — compara _prisma_migrations con el
#      filesystem y aplica SOLO las pendientes (idempotente: seguro en
#      cada arranque, redeploy o restart de la VM).
#   2. Si la DB está vacía (sin roles baseline) → seed prod (baseline +
#      admin). Solo corre en el primer boot contra una Neon vacía.
#   3. Arranca el server.
set -e
cd /app/apps/api

# Neon: migraciones por el endpoint DIRECTO si está configurado — el
# pooler (-pooler) trabaja en modo transaction y puede interferir con
# los advisory locks de prisma migrate. MIGRATION_DATABASE_URL tiene
# precedencia (la usa el workflow; DIRECT_DATABASE_URL es el alias
# canónico de Neon/Prisma); sin ninguna cae al DATABASE_URL de la app.
MIGRATE_URL="${MIGRATION_DATABASE_URL:-${DIRECT_DATABASE_URL:-$DATABASE_URL}}"

if [ -z "$MIGRATE_URL" ]; then
  echo "[boot] ERROR: DATABASE_URL no está configurada" >&2
  exit 1
fi

echo "[boot] prisma migrate deploy…"
DATABASE_URL="$MIGRATE_URL" npx prisma migrate deploy

echo "[boot] verificando baseline…"
ROLES=$(node -e '
  const { PrismaClient } = require("@prisma/client");
  const p = new PrismaClient();
  p.role.count()
    .then((c) => console.log(c))
    .catch(() => console.log(-1))
    .finally(() => p.$disconnect());
')

if [ "$ROLES" = "0" ] || [ "$ROLES" = "-1" ]; then
  echo "[boot] DB vacía — seed prod (baseline + admin)…"
  DATABASE_URL="$MIGRATE_URL" SEED_ENV=prod npx tsx prisma/seed.ts
else
  echo "[boot] DB con datos ($ROLES roles) — seed omitido"
fi

exec node dist/main.js
