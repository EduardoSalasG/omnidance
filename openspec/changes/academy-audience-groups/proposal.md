# academy-audience-groups

## Why

El dueño de academia ya puede enviar campañas desde `/crm/campanas`
(NOTIFY + DISCOUNT_CODE), pero los criterios de audiencia son los
segmentos conductuales genéricos (NEW/AT_RISK/CORE/BRINGS_PEOPLE) + tags
manuales + `personIds` (modelo existe, sin UI). Falta el grupo natural de
su negocio: **todos los alumnos**, **por estado de inscripción**
(ACTIVE/TRIAL/PAUSED/ONLINE/FROZEN), **por plan** y **por serie**. Además
el envío es a ciegas — sin saber cuántas personas alcanzará — y no puede
armar un grupo ad-hoc eligiendo alumnos.

## What Changes

- `CampaignSegment` suma criterios de academia: `allStudents?: boolean`,
  `enrollmentStatus?: EnrollmentStatus[]`, `planId?: string`,
  `seriesId?: string`. Solo válidos para `actorType: "ACADEMY"` (400 en
  otro actor). Se unen (OR) con los criterios existentes.
  - `allStudents`/`enrollmentStatus`/`planId`: `Enrollment` de la academia
    (para `allStudents` cualquier estado).
  - `seriesId`: personas con `ClassBooking` (cualquier estado no
    CANCELLED) en clases cuya slot.seriesId = X.
- `POST /crm/campaigns/preview` `{actorType, actorId, segment}` →
  `{count}` (resuelve sin enviar). El form muestra la audiencia en vivo.
- `CampaignForm`: sección de grupo academia (multi-chip de estados +
  select de plan + select de serie + "todos los alumnos"), picker de
  personas con checkbox (alimenta `personIds`), y contador de preview
  (debounced).
- Las campañas manuales NO llevan cooldown — cada send es intencional y
  DRAFT→SENT ya impide reenvío de la misma campaña (decisión: cooldown es
  para triggers automáticos).

## Impact

- Affected specs: `crm/campaign-audience` (nueva capability).
- Affected code: `crm.service.ts` (parseSegment + resolveSegment +
  previewCampaign), `crm.controller.ts` (endpoint preview),
  `components/crm/campaign-form.tsx`, `types.ts`, i18n `parts/crm.json`.
- Datos: sin migración — `segment` es JSON en `Campaign`.
