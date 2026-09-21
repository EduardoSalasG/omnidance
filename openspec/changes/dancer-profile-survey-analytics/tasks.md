# Tasks — dancer-profile-survey-analytics

## 1. Schema

- [ ] `enum Gender {M F OTHER}` + `Person.gender Gender?`; `EventRating.overall Int?`; `Event.surveyNotifiedAt DateTime?` — migración
- [ ] Seed dev: género + styleRoles a personas demo

## 2. API: perfil de baile

- [ ] `GET /api/styles` (catálogo `{id,name,genre}` por género)
- [ ] `PATCH /api/me/profile` `{gender?, styleRoles?: [{styleId,role,level?}]}` — replace-set transaccional; `GET /me` expone `gender`+`styleRoles`
- [ ] e2e: replace idempotente, género nullable

## 3. API: encuesta post-social

- [ ] `EventRating.overall` en DTO + validación; exigir `Checkin` no voided para evaluar (además de ventana 24h)
- [ ] Trigger lazy: al cargar home/stats de un asistente → marcar `surveyNotifiedAt` + `notifySafe` a asistentes (una vez por evento)
- [ ] `GET /api/me/pending-surveys` (o en home/stats): eventos evaluables del usuario
- [ ] e2e: gate check-in, ventana, upsert, overall, trigger idempotente

## 4. Web: perfil + encuesta

- [ ] `/perfil` sección "Cómo bailas": género (M/F/Otro) + picker de estilos con rol + nivel; guardar → PATCH
- [ ] `/inicio`: card "¿Cómo estuvo [evento]?" cuando hay pending-surveys
- [ ] `/eventos/[id]/evaluar`: StarRating × dims (overall obligatorio; Música/Gente/Temperatura con labels bipolares; "Evaluar más" → organization/floorComfort/lightingSound)

## 5. Analítica por evento + sidebar

- [ ] `GET /api/events/:id/analytics` (owner/admin): attendees, gender split, L/F split por género del evento, ratings con k-anonymity ≥3
- [ ] `/productor/eventos/[id]`: sección Analítica (cards + barras + estrellas)
- [ ] Sidebar: "Analítica" como módulo propio (producer → sus eventos; admin → lens por rol fuera de Administración)

## 6. Verificación + docs

- [ ] Suite API completa, tsc, ALL_KEYS_OK, detector impeccable
- [ ] Probes: perfil guarda estilos, card encuesta en /inicio, /evaluar SSR, analítica productor
- [ ] architecture.md + openapi/postman; commit → dev → push
