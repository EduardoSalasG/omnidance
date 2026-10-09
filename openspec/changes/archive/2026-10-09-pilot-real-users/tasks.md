# Tasks — pilot-real-users

## 1. Auth - claim de cuenta pre-sembrada

- [x] 1.1 `sendMagicLink` extraído como helper privado del controller
     (el link apunta al origen web para que la cookie caiga ahí).
- [x] 1.2 `register`: email existente + password correcto → sesión
     emitida (reclamo sin correo); sin match o sin passwordHash →
     magic link best-effort + 409 orientador.
- [x] 1.3 Specs: password correcto → sesión sin Person duplicada;
     sin password → link + 409 y el verify adjunta la Person;
     password incorrecto → link + 409.

## 2. Checkout - método siempre visible

- [x] 2.1 `OwnMethodPicker`: sin early-return por lista vacía; la
     pasarela queda como única opción marcada.
- [x] 2.2 `checkout-client` (eventos): el picker siempre dentro de su
     `Card`.
- [x] 2.3 `ManualPayPanel` (membresía): sin early-return por 0
     métodos — la pasarela queda visible como opción única.

## 3. Seed - usuarios reales y data de escena

- [x] 3.1 Gabriel con rol DANCER + data social (tickets, amigos,
     sesiones, mesa, estilos, ig/fono, check-ins, badges).
- [x] 3.2 `monica@omnidance.cl` DANCER con password `gatoperro123`,
     social completo, alumna de Adrian y Leo (plan más caro) con
     asistencias y reservas.
- [x] 3.3 `maria@omnidance.cl` DANCER+INSTRUCTOR, social completo,
     alumna Ilimitado de Mambo Madness y profe de Iniciación
     lun 19:30/20:30 + sáb 17:00/18:00.
- [x] 3.4 Academia "Adrian y Leo" (solo mambo): Adrián owner+
     instructor, Leo instructor, planes, series "Mambo" y
     "Shines Mambo".
- [x] 3.5 muvet owner con rol INSTRUCTOR y la serie Cubano asignada.
- [x] 3.6 MercadoPago `PAYMENT_LINK` en Mambo Madness.
- [x] 3.7 Trilogía 5ta edición: serie 1x/month:sat este sábado en
     Orixas (Carlos), DJs Fabián/Moreno/DJ Criss, aforo 350, preventa
     $6.000 + puerta $8.000 + lista $5.000 (specialPrice), programa
     del flyer, shows vía `showRosters`, guest list poblada; SCE
     corre a `weeksAhead: 1`.
- [x] 3.8 Poda de estilos removidos en `seed-common` (Salsa on2,
     Bachata dominicana) con null-out de refs estructurales.
- [x] 3.9 Cleanup E2E con cascada explícita al final de `seedDev`;
     `TEST_MARKS`/`TEST_*_ROOTS`/`isTestName` hoisteadas y reutilizadas
     para filtrar `pubEvents` en `goingPlan` (tickets no caen en
     eventos condenados).

## 4. Piloto prod

- [x] 4.1 `seed-prod.ts` → `seed-prod-baseline.ts` (seed real
     preservado, corre con `SEED_ENV=baseline`).
- [x] 4.2 Dispatch `SEED_ENV=prod` → `seedDev` + `SEED_ADMIN_EMAIL`
     opcional.
- [x] 4.3 Docs: `architecture.md`, `ci-cd.md`, comentario del
     dispatcher.

## 5. Verificación

- [x] 5.1 `tsc --noEmit` api y web limpios.
- [x] 5.2 Suite api completa: 1803/1803 (incluye las 3 specs nuevas
     de auth).
- [x] 5.3 `prisma db seed` ×3 corridas idempotentes; residuo E2E = 0;
     Trilogía/Adrian y Leo/usuarios verificados en DB.
