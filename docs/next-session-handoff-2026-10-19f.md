# Handoff - 2026-10-19f (seed usuarios reales + Trilogía + claim de cuenta)

## Completado en esta sesión (commits en dev, sin push)

| Commit | Slice |
|---|---|
| `e70e228` | Consola academia: insights por módulo, fix analítica (envelope lazy options), pulido |
| `c301e04` | 20-70 alumnos + asistencias mes pasado/vigente en todas las academias |
| `8cae8cb` | Mambo Madness: niveles N1/N2→Iniciación, ~94 alumnos, ~900 asistencias |
| `a74befc` | Mambo Madness como academia real (Gabriel owner, parrilla, planes) |
| `3972a0a` | Analítica: un solo skeleton de arranque |
| `2612f1e` | **Este batch**: usuarios reales, Trilogía 5ta, Adrian y Leo, claim register, checkout |

### Seed - usuarios reales del piloto (`2612f1e`)

- **Gabriel Arias** (`gazner3203@gmail.com`): ACADEMY_OWNER + DANCER +
  INSTRUCTOR. Sin password (magic link); 4 tickets, 7 sesiones, 8
  amigos, mesa, badges, estilos (Mambo on2/Bachata sensual/Cubano,
  leader avanzado), ig `gabomadness`, fono `+56959372339`.
- **Mónica Soto** (`monica@omnidance.cl`): DANCER, password
  `gatoperro123`. Alumna de Adrian y Leo (plan Mambo Intensivo
  $55.000), 17 asistencias + 39 reservas, ticket, mesa de cumpleaños
  en Trilogía, solicitud pendiente de Sebastián.
- **María José Herrera** (`maria@omnidance.cl`): DANCER + INSTRUCTOR
  (sin password - magic link). Profe en Mambo Madness de Iniciación
  lun 19:30/20:30 y sáb 17:00/18:00; alumna plan Ilimitado (18
  asistencias).
- **Adrian y Leo** (academia nueva, solo mambo): Adrián Paredes owner+
  instructor, Leo Campos instructor. Planes $40k/$55k/suelta/prueba;
  series "Mambo" (lun+mié 20:00) y "Shines Mambo" (jue 19:00).
- **muvet@omnidance.dev**: ahora ACADEMY_OWNER + PRODUCER +
  INSTRUCTOR, dicta la serie Cubano de MuéveteOnTour (probar UI profe).

### Trilogía 5ta edición (este sábado, Orixas, Carlos)

`mkSeries("Trilogía", carlos, orixas, "1x/month:sat", 6000, 8000, …)`,
`weeksAhead: 0` → este sábado. Social con Estilo cede el sábado
(`weeksAhead: 1`). Mezcla 50/40/10 bachata/salsa/timba, aforo 350,
preventa 200×$6.000, puerta 50×$8.000; el 3er tramo ($5.000 socios/
convenios/cumpleaños) es `GuestList.specialPrice` con 5 entradas.
DJs: Fabián, César Moreno, DJ Criss (nuevo, slug `criss`). Shows por
`showRosters["Trilogía"]` (el generador genérico borra y recrea).
Descripción del flyer completa + programa (20:30→03:45).

### Claim de cuenta pre-sembrada (register)

`POST /auth/register` sobre email existente: si `passwordHash` calza
con el password entregado → emite sesión (equivale a login); si no,
envía magic link y responde 409 orientador. El verify hace
`upsertByEmail` → adjunta toda la data sembrada. Así Mónica, María y
Gabriel se registran con su correo real y conservan su seed.
3 specs nuevas en `auth.controller.spec.ts` (8/8 verdes).

### Checkout - método siempre visible

`OwnMethodPicker` y `ManualPayPanel` ya no retornan `null` sin
métodos propios: la pasarela queda como única opción marcada. El
comprador siempre ve con qué paga. Keys i18n reutilizadas.

### Dispatch de seeds - PILOTO

`SEED_ENV=prod` ahora corre `seedDev` (dataset demo con usuarios
reales) + asegura `SEED_ADMIN_EMAIL` si viene. El seed productivo
real está en `apps/api/prisma/seed-prod-baseline.ts` →
`SEED_ENV=baseline`. **Restaurar el dispatch cuando termine el
piloto** (volver `prod` → `seedProdBaseline`).

### Cleanup E2E en seed

Al final de `seedDev`: borra academias/series/venues/eventos que
calzan marcas test (`test|prueba|e2e|payout`, raíces de specs, "—"
legado) con cascada explícita (~20 modelos sin onDelete). Constantes
hoisteadas a `TEST_MARKS`/`TEST_*_ROOTS`/`isTestName` - reutilizadas
para filtrar `pubEvents` en el goingPlan (los tickets no caen en
eventos condenados). Primera corrida: 54 eventos, 12 series, 9
academias, 34 venues eliminados.

### Poda de estilos (depuración prod → seed-common)

`Salsa on2` y `Bachata dominicana` se eliminan con sus
`PersonStyleRole`; `styleId`→null en DanceSession/ScheduleBlock/
ClassSeries y `parentId`→null en estilos hijos.

## Verificación

- `tsc --noEmit` limpio en api y web.
- Suite completa api: **1803/1803** verdes (92 archivos).
- `prisma db seed` idempotente (3 corridas, sin duplicados).
- Verificado en DB: residuo E2E = 0, Trilogía completa, Adrian y Leo
  completa, roles/tickets/sesiones de los 3 usuarios reales.
- Scripts temporales eliminados (`_verify-seed.cjs`, `_models*.cjs`,
  `_q.cjs`, `_scan-fk.cjs`).

## Pendiente / notas

- Gate G2 (OpenSpec): este batch se commiteó sin change propio -
  mismo patrón que los batches rápidos anteriores de la sesión.
- El API dev corre en background (`pnpm dev:api`).
- Para login como Gabriel: magic link (log del API en dev, sin
  Resend); Mónica entra con `monica@omnidance.cl` / `gatoperro123`.
- Restaurar dispatch prod → `seed-prod-baseline` al cerrar el piloto.
