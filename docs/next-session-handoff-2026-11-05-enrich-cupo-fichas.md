# Handoff: cupo efectivo en enrich + smoke visual fichas (pasada B cierre)

**Rama**: `dev`. Stack al cierre: DB/Redis docker sanos; API dev con
`PAYMENT_GATEWAY=stub` en :4000 y web **`next start` (prod build)** en
:3000 quedaron vivos. Para dev normal: `pnpm dev` (ojo: el web quedó
en prod build, no en `next dev`).

## Commit de la sesión

- `c691c793 fix(seed,i18n): cupo efectivo en enrich de academias +
  limpieza menor` — sin openspec (tooling de seed interno, catálogo
  muerto y comentario; sin cambio de comportamiento de producto).

## QUÓRUM > cupo: causa raíz y fix

`bookedCount` de las cards = reservas BOOKED. El enrich sembraba
reservas Tumbao (10-15/clase) **sin consultar cupo y acumulando entre
corridas** (offset determinístico tomaba otro slice del roster → +10-15
por run → 30+ vs cupo 15). Asistencias fallback del roster tampoco
capeaban.

Fix en `enrich-academy-seed.cjs`:

- Helper `capOf` replica `effectiveCapacity` del dominio
  (class.capacity → slot.capacity → series.quorum →
  academy.defaultQuorum → 20) + `capSelect` compartido.
- Asistencias (paso 4): tope `capOf(cls)` tanto en fallback roster
  como en el loop sobre bookings.
- Reservas Tumbao: objetivo por clase = `min(cupo, 10-15)` en total;
  re-correr solo rellena el déficit.
- **Pase nuevo de normalización** sobre clases vivas (cualquier fecha):
  conserva los primeros `cap` asientos FIFO y recorta el excedente
  (reservas sin pago; las BOOKED con `paymentId` no se tocan — una
  devolución no corresponde al seed).

## Evidencia

- `pnpm db:enrich` corrido completo: `Sobre-cupo normalizado: 18213
  reservas + 3368 asistencias recortadas`.
- Verificación post-fix por query directa: **1.945 clases vivas, 0
  sobre cupo** en bookings y attendances.
- Smoke visual fichas (storageState academy, desktop 1280 + mobile
  390): serie Bachata, clase hoy (QUÓRUM 20/20), clase 31 Dic
  (QUÓRUM 12/20) — sin crashes ni layout roto. Shots en
  `e2e/polish-shots/{desktop,mobile}-ficha-*.png` (commiteados).

## Cerrado del pendiente anterior

- `pnpm db:enrich` (era el pendiente de console-polish): corrido.
- `GET /academies/:id/surveys` limit: ya estaba implementado server-side
  desde `93c1f0a6`; quedaba comentario stale en `survey-results.tsx`
  → actualizado.
- `academySeries.creating`: huérfana confirmada y eliminada junto a 7
  hermanas del bloque base (`actions`, `deactivateConfirm`,
  `detailBack`, `edit`, `importClasses`, `instructor`,
  `removeSlotConfirm`) en los 4 locales. Ningún `t()` las usaba.
- Smoke visual fichas de clase/serie: hecho (arriba).

## Corrida mobile/WebKit e2e (commit `db8f5bb0`)

**Resultado: proyecto mobile 46/46 verde** (chromium 51/51 ya pasaba
en la misma corrida). Receta usada: prod build + `next start` en
:3000 + API dev con `PAYMENT_GATEWAY=stub` inline.

Bloqueo raíz encontrado (no era flake): `upgrade-insecure-requests`
del CSP en `middleware.ts` se emite en prod build; Chrome exime
localhost de la directiva pero **WebKit la honra** → todo subrecurso
y llamada al API subía `http→https://localhost` → SSL connect error →
página SSR sin hidratar → toda interacción muerta (33/39 mobile
fallaban, 0 chromium). Fix: la directiva solo se emite para hosts
no-locales (`isLocalHost`); prod real no cambia.

Specs endurecidos (patrones WebKit):

- `networkidle` tras goto antes de llenar forms (la hidratación pisa
  `fill`/`click` previos → campos vacíos o clicks sin handler).
- `toHaveURL` (poll) en vez de `waitForURL` post-login/submit:
  navegaciones por `window.location` expiran esperando `load` bajo
  carga paralela.
- `staff-puerta`: la lista de la noche en mobile vive bajo el tab
  "Asistentes" (desktop la muestra junto al escáner).
- `productor-eventos`: WebKit no soporta grant de clipboard ni
  `readText` sin permiso → assert del toast solamente.
- Setup `producer` puede tardar ~2.2m (retry tras throttle 429 del
  login paralelo) — es el mecanismo esperado, no un bug.

## Pendiente

### Personas reales para QA con gateway=flow (pedido del usuario)

Idea: usar correos reales para correr QA con `PAYMENT_GATEWAY=flow`
(Flow rechaza `*@omnidance.dev`; con correo real el checkout puede
proceder al redirect de Flow sandbox). Estado actual en DB (2026-11-05):

| Email | Existe | Roles | Data | Propuesto |
|---|---|---|---|---|
| salas.eduardo03@gmail.com | sí, verified | DANCER | 1 enrollment, 1 booking, 3 att, 1 payment | **dancer** |
| salas.eduardo.cl@gmail.com | sí, verified | DANCER+ACADEMY_OWNER+INSTRUCTOR | owner "La Casa del Mambo", 2 enr, 13 bookings, 17 att, 6 payments | **academy** |
| salas.eduardo03@outlook.com | sí, NO verified | DANCER | sin data (cuenta nueva 11-02) | **producer** (asignar rol) |
| salas.eduardo.backup@gmail.com | sí, verified | DANCER+ACADEMY_OWNER | owner "Mi mambo", sin data | academy backup / segundo dancer |
| hello@eduardosalasg.dev | NO existe | — | — | crear si se necesita producer real o staff |
| eduardo.salasgo@correoaiep.cl | NO existe | — | — | crear si se necesita staff/soporte |

Trabajo para la próxima sesión:

1. **Roles**: asignar rol PRODUCER a la persona elegida (outlook o
   hello@). `Event.producerId` apunta a `Person.id` — el rol de
   productor es PersonRole.
2. **Password para auth.setup**: los e2e hacen login por password
   (`USERS`/`PASSWORD` en e2e/helpers.ts). Las cuentas reales nacieron
   por magic link → probablemente sin `passwordHash` usable. Setear
   hash de `omnidance123` (mismo hash que el seed) en las personas
   elegidas, o extender helpers con un segundo set de usuarios QA
   (QA_USERS real) en vez de pisar USERS.
3. **Specs flow-mode**: los specs de checkout asumen stub (PAID/FAILED
   deterministas). Con flow real el checkout redirige a flow.cl —
   conviene un spec aparte "hasta el redirect" o correr QA manual.
   Decidir si los specs stub se mantienen en stub (recomendado: sí) y
   flow se prueba manual/adicional.
4. **Verificar claves Flow del .env**: sandbox vs producción — QA debe
   quedar en sandbox sí o sí.
5. Magic link a correos reales llega al inbox real solo si el SMTP del
   API apunta a un transport real — en dev probablemente no; para QA
   usar password login (punto 2).

### Resto

- `multipais-foundation` tasks 10/11/13 (épica: pases multi-día
  cross-academia, prácticas/socials free como adquisición por ciudad,
  congresos/festivales) — cada una es un change propio, requiere
  priorización.
- Smoke real opcional del job `platform-charges.collect`
  (`POST /admin/jobs/platform-charges.collect/run`, cubierto por specs).

## Notas operativas

- `git` no está en PATH: `export PATH="/c/Program Files/Git/bin:$PATH"`.
- **Zombie `next start`**: quedó un node PID reteniendo :3000 con el
  socket en CLOSED (curl 000 pero EADDRINUSE). Diagnóstico:
  `netstat -ano | grep 3000` → matar PID (este fue 13076). Patrón ya
  documentado en AGENTS.md (dev server zombie).
- `pwsh` disponible; `powershell` no está en PATH de Git Bash.
- `PAYMENT_GATEWAY=stub` se pasó **inline** al proceso del API
  (`PAYMENT_GATEWAY=stub pnpm dev:api`), no al `.env`: el `.env` raíz
  trae `flow` (gateway real) que rechaza los emails `*@omnidance.dev`
  del seed y haría pagos reales en QA. El stub devuelve PAID/FAILED
  deterministas para los specs de checkout/membresía. Un `pnpm dev`
  normal vuelve a leer el `.env` → flow.
- Screenshots: `pnpm exec playwright screenshot --load-storage
  e2e/.auth/<rol>.json --viewport-size "W,H" --wait-for-timeout 3500
  <url> <out.png>` — sirve para pasadas puntuales sin escribir spec.
- Las clases de "hoy" de MuéveteOnTour quedaron 20/20 con todos
  SIN CONFIRMAR (la clase es 19:30 y aún no se dicta — correcto).
