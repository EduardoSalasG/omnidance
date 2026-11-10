# Handoff: agenda owner cerrada (TierPrice + ficha campañas + CAC orgánico)

Sesión 2026-11-10 (noche, continuación de `deeplinks-cierre`).
Se ejecutó la agenda confirmada por el owner: 2 decisiones resueltas,
2 changes implementados y archivados, 3 commits.

## Trabajo completado

### 1. Decisiones owner (cerradas)

- **Modelo del import**: ya estaba resuelto - el pendiente era stale
  en los handoffs. `academy-import-invites` implementó la opción (b)
  AcademyInvite bulk (nunca escribe Enrollment) + migración ACTIVE
  sin plan → INACTIVE.
- **TierPrice dev vs spec**: owner decidió "la spec manda". Dev DB
  restaurada (UPDATE transaccional, `update:{}` del seed no pisa
  params editados en /admin): TierPrice CL COBROS
  39.500/218.040/402.900, STUDIO 79.700/439.944/812.940, PRO
  120.500/665.160/1.229.100, PRO_STARTER+PRO_GROWTH
  79.700/439.944/812.940, PRO_BIG ya ok; params `*_monthly_clp`
  coherentes + `academy_billing.trial_days`=15. NOTA:
  `producer_tier.starter`=growth=79.700 NO era divergencia (Starter
  legacy ≤$2,5M y Standard ≤$8M comparten precio por spec).
  `docs/pitch-comercial-tiers.md` §5 quedó como resuelto.

### 2. `admin-campaign-detail` (archivado, commit `09d6343c`)

- Ficha `/admin/campanas/[id]` nueva: fetch paralelo `GET :id` +
  `GET :id/runs`; header desnudo navega a `nueva?edit=` solo si
  DRAFT/SCHEDULED; `<dl>` detalle; preview `htmlBody` iframe sandbox;
  runs con LIST_PREVIEW + SeeAllRow; acciones test (sin confirm) /
  run / cancel con ConfirmSheet + ActionNotice; cancel en zona
  destructiva; estados loading/error/404.
- Listado refactorizado: card → Link a ficha (hover + chevron), sin
  acciones inline (console-patterns §2-3).
- `Campaign.createdAt` añadido al type; i18n `campaigns.detail.*` +
  `campaigns.runs.*` en los 4 catálogos.
- Tests: `campanas/[id]/page.test.tsx` 8/8.

### 3. `organic-acquisition-source` (archivado, commit `85ca2bb9`)

- `Person.acquisitionSource` (`utm:<s>`|`ref:<host>`|`landing:<path>`
  |`direct`) + `acquisitionDetail` Json; `AuthOtp.acquisition` Json.
  Migración `20261110000000_acquisition_source` aplicada en dev.
- `resolveAcquisition()` en `auth/domain/acquisition.ts` normaliza
  en servidor (utm > referrer externo > landing > direct; hosts
  propios filtrados). Viaja igual que role/consent/next: claim del
  magic token + fila AuthOtp; `AcquisitionDto` en `ConsentField`
  (register + magic-link). Solo se escribe en el alta; cuenta
  existente no pisa; invite (sin claim) queda null → su canal sigue
  siendo Referral INVITE.
- `person.registered` data += `acquisitionSource`.
- Web: `lib/acquisition.ts` first-touch en
  `localStorage["omnidance:acq"]`; `AcquisitionCapture` montado en
  layout (marketing); login-form adjunta `acquisition` en register y
  magic-link (no en password login).
- Tests: auth.controller.spec +6 (32/32), acquisition.test.ts 3/3.

## Verificación corrida

- API: auth.controller.spec 32/32, `npx tsc --noEmit` limpio.
- Web: `npx tsc --noEmit` limpio, ficha 8/8, lib acquisition 3/3,
  eslint archivos tocados limpio, i18n-audit `ALL_KEYS_OK`.
- `openspec validate --changes` verde; ambos changes archivados con
  deltas aplicados a specs canónicas.
- Migración aplicada a dev DB vía `migrate diff` + `migrate deploy`
  (migrate dev es interactivo y falla en esta shell).

## Notas de entorno

- **Se mató el dev server de API** (PID 868 `node dist/main.js`):
  bloqueaba el DLL de @prisma/client y `prisma generate` fallaba
  EPERM. Hay que re-levantar `pnpm dev:api` cuando se necesite.
- `prisma migrate dev` no corre en esta shell (non-interactive) -
  receta: `prisma migrate diff --from-url $DATABASE_URL
  --to-schema-datamodel prisma/schema.prisma --script` → archivo en
  `prisma/migrations/<ts>_<name>/migration.sql` → `migrate deploy`.
- Git solo funciona con `shell_flavor: powershell` (PATH de bash sin
  git, como la sesión anterior).
- Lock `.openspec-archive.lock` stale reapareció otra vez: `rm`
  antes de archivar (sigue documentado).

## Pendientes

- **Smoke manual del push de dispositivo**: click real de la
  notificación `data.path`/`data.url` en dispositivo registrado
  (requiere humano + dispositivo; no automatizable).
- multipais-foundation tasks 10/11/13 (sin abrir).
- Reporte CAC por canal: la data ya se persiste
  (`Person.acquisitionSource`), falta la consulta/vista (¿donde?
  ¿admin analytics?).
- `academy.sale_deal.responded` scope series sin ficha (cae al
  centro - decisión de producto pendiente).
- `claimUrl`/`collectUrl`/`paymentUrl` en data de notificaciones son
  URLs de API - si se quiere CTA directo a la página de pago emitir
  `path` (decisión de producto).

## Próxima sesión sugerida

1. Smoke manual del push (con dispositivo del owner).
2. Decidir superficie del reporte CAC por canal
   (`acquisitionSource` ya queryable).
3. Retomar multipais-foundation task 10/11/13 si el owner prioriza.
