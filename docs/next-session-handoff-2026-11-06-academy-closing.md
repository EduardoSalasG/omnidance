# Handoff 2026-11-06 - cierre del pase Academy Owner

## Estado de commits (dev, todo pusheado salvo indicación)

Últimos: `91432825` invite alta de alumno · `dfa8395e` anchos pdf +
anti-flash billing · `ca5be00e` anti-flash reporte · `7e3b3f30`
layout pdf · `e07d10f7` #/metodos/kpi cards pdf · `8d21db27` export
cobros csv/pdf marca+i18n · `5ebabf9a` drop classId · `2ab89a34`
cascada acumulativa · `997ac5b2` cascada+nivel · `cd53a12f`
nav-order+deleted · `53aaa848` analitica-ux · `3cd98970` seed+smoke.
Smoke `apps/api/scripts/smoke-ux-review.cjs` 12/12.

## Hecho esta sesión (ya commiteado)

- **Alta parcial con invitación** (`/academia/alumnos/nuevo`): si el
  buscador no encuentra a la persona, "Registrar nueva persona" pide
  email+nombre → `POST /academies/:id/enrollments` ahora acepta
  `email`+`name` además de `personId` (DTO, createEnrollment find-or-
  stub, magic link 7d via `studentInviteEmailHtml`, mailer
  best-effort, respuesta `invited`). i18n en los 4 catálogos. Specs
  ajustadas (constructor del controller ganó auth+mailer).
- **Export del reporte de cobros**: `GET /academies/:id/billing-
  report.{csv,pdf}` (filtros+lang, filename localizado, PDF con
  marca Omnidance en `buildTablePdf`, KPI cards, columna #, métodos
  normalizados, colWidths). Todos los exportes PDF heredan marca.
- **Anti-flash**: skeleton solo en carga inicial en reporte,
  academy-billing, pro-section.
- **Analítica**: nivel→serie→horario acumulativo, instructor por
  serie/slot, classId retirado (redundante con horario+fechas).

## Pendiente de esta sesión (con inteligencia, queda para la próxima)

1. **Selector de academia en el SIDEBAR del owner**, condición:
   `owned.length > 1 || alguna academia propia tiene multiAcademy`.
   - El gating ya existe en `AcademyGate` (academy-gate.tsx:191:
     `selector && (academies.length > 1 || canCreate)`); el dropdown
     incluye la opción "+ Nueva academia" y persiste en
     `localStorage["omnidance:academy-id"]`.
   - El drawer del owner se arma en `BottomNav.tsx` (~línea 1371,
     `drawerGroups` desde `roleDrawer.map`); montar un selector propio
     arriba de los grupos cuando la lente es ACADEMY_OWNER (fetch
     `/academies/mine`, owned = `a.ownerId === me.id`, canCreate =
     `owned.some(a => academyTierHas(a.tier, "multiAcademy"))`,
     misma regla que POST /academies).
   - Hoy el selector solo aparece en `/inicio` (AcademyGate selector
     en HomeHub). Decisión del usuario: en el sidebar solo si >1
     academia o el plan permite crear más.
2. **Sync docs**: `omni-dance.md` (invite flow + selector rule +
   export del reporte) y `docs/architecture.md` (endpoints export,
   cascada dependsOn, academyLevels, billingReportExport).
3. **Versionado/promoción**: se pidió "comiteas, versionas y
   promueves" - los commits están hechos; falta el tag/release y
   el push si así lo define el usuario (dev local, sin remoto
   configurado? verificar `git remote -v`).

## Deferido por el usuario (otra sesión, decisiones ya tomadas)

- **3. Modelo de video** (categorías/selects, videos como add-on
  cobrado) - pendiente.
- **4. Tracking de campañas** (funnel enviados→tap→acción;
  `campaignId` en push + evento de apertura) - pendiente.
- **5. Ads/conversión en Explorar + disponibilidad de instructores**
  - backlog, sin spec.

## Reglas del usuario vigentes

- Paginación 20 desktop / 10 mobile (`useConsolePageSize`).
- Sin tecnicismos en copy; enums traducidos.
- Anti-flash: skeleton solo en carga inicial, nunca en refetch.
- "método de pago" como terminología.
- Openspec change obligatorio + validate + archive; inventario
  `docs/qa-flows-inventory.md` en el mismo cambio; sin `—`/`--`/`
  - ` como separador de ideas.
- La API corre con `pnpm dev:api` en :4000 (el proceso se reinició
  esta sesión por rutas stale); web :3000. Si un cambio backend no
  pega, restart del proceso.
