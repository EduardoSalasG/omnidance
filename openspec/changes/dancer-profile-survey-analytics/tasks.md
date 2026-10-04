# Tasks — dancer-profile-survey-analytics

Decisiones resueltas en design.md (addendum 2026-10-04) — leer antes.

## 1. Schema

- [x] `enum Gender {M F OTHER}` + `Person.gender Gender?`; `EventRating.overall Int?`; `Event.surveyNotifiedAt DateTime?` — migración
- [x] Seed dev: género + styleRoles a personas demo; `overall` en `rateEvent`

## 2. API: perfil de baile

- [x] `GET /api/styles` → `orderBy [{genre},{name}]` (shape plano intacto)
- [x] `PATCH /me` acepta `gender?` (nullable); `GET /me` expone `gender`+`styleRoles` (styleRoles siguen por `PUT /me/style-roles` — NO crear `PATCH /me/profile`)
- [x] Spec nuevo `people.controller.spec.ts`: gender PATCH, GET /me lo expone

## 3. API: encuesta post-social

- [x] `EventRating.overall` en DTO (`@IsInt @Min(1) @Max(5)`, opcional — la gate check-in/ventana YA existe)
- [x] `GET /me/pending-surveys` en `people.controller` → `[{eventId,name,endsAt}]` (checkin no-voided, `now ∈ (endsAt, endsAt+24h]`, sin rating propia); fan-out lazy ahí mismo: claim `updateMany(surveyNotifiedAt null→set)` + `notifySafe` type `event.survey` a todos los asistentes del evento ganado
- [x] spec/e2e: overall, pending-surveys (elegible/expirado/ya evaluado), trigger idempotente (2 requests → 1 notif por persona)

## 4. Web: perfil + encuesta

- [x] `/perfil/datos` sección "Tu baile": segmented género M/F/Otro (nullable); estilos ya existen
- [x] `/inicio` (HomeHub): card "¿Cómo estuvo [evento]?" si pending-surveys > 0 — cualquier lente
- [x] `/eventos/[id]/evaluar`: StarRating × dims (overall obligatorio en UI; labels bipolares; "Evaluar más" → dims extra); `notificaciones/page.tsx` hrefFor case `event.survey`
- [x] i18n: `parts/survey.json` nuevo + registro en `messages.ts` + keys profile

## 5. Analítica por evento + sidebar

- [x] `GET /api/events/:id/analytics` (owner/admin) en `event-analytics.controller.ts` nuevo: `{attendees, genderSplit, roleSplit, ratings:{count,byDim}}` — splits/ratings null si attendees < 3
- [x] `/productor/eventos/[id]`: sección Analítica (cards + barras + estrellas)
- [x] Sidebar: `/analitica` fuera del grupo admin → grupo propio; quitar card analítica de `/admin`; NO crear `/productor/analitica`

## 6. Verificación + docs

- [ ] Suite API + tsc api/web + i18n-audit ALL_KEYS_OK + detector impeccable
- [ ] export-api-docs.cjs → openapi/postman commiteados; flows.md si aplica
- [ ] Archivar change + handoff
