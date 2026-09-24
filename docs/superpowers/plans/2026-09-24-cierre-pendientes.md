# Cierre de pendientes — Academy + perfil + sweep

Fecha: 2026-09-24. Alcance: implementar todo lo pendiente del handoff.

## Decisiones tomadas (usuario)

- Contacto academia: `instagram` (handle, como Person) + `whatsapp` (teléfono → wa.me).
- Foto de perfil: NO — sin storage en el repo (documentado). Sí: nombre + teléfono editables en `/perfil/datos`.

## Tasks

### T1 — Schema + API: contacto + edición perfil academia
- `Academy` + `instagram String?`, `whatsapp String?` (db push + generate).
- Extender `PATCH /academies/:id/settings` (requireAdminister existente) → acepta
  `description`, `address`, `lat`, `lng`, `instagram`, `whatsapp` (todos opcionales,
  "" → null; validación handle IG + phone E.164-laxo + lat/lng rango).
- `GET /academies/:id/profile` expone `instagram`, `whatsapp` en `academy`.
- Commit propio.

### T2 — Consola `/academia`: card "Perfil público"
- Nueva sección `AcademyProfileSection` junto a `AcademySettings` (misma guard
  owner/ADMIN): inputs descripción (textarea), dirección, lat/lng, instagram,
  whatsapp → PATCH settings. Patrón Editar/Guardar/Cancelar de `/perfil/datos`.
- i18n `academy.profile.*` en academyExtras.json.

### T3 — Ficha `/academias/[id]`: contacto
- Links Instagram (`instagram.com/{handle}`) y WhatsApp (`wa.me/{phone}`) bajo
  descripción; `target=_blank rel=noopener`. Ocultos si no hay datos.

### T4 — Insignias academy
- `BadgeStats` + campos academy: `classAttendances`, `academyStreakWeeks`,
  `distinctAcademies`. `attendancesForPerson` devuelve `academyId` también.
- `BADGE_RULES` + 4 reglas: `primera_clase` (≥1 asistencia, MILESTONE),
  `alumno_constante` (≥10 asistencias, MILESTONE), `racha_academia`
  (≥4 semanas seguidas, CONDUCT), `explorador_academias` (≥3 academias, CONDUCT).
- `BADGE_CATALOG` seed + nombres es-CL.
- `evaluateBadgesFor` carga asistencias (fuentes nightlife + academy en una pasada).
- `/perfil`: modo academy muestra badges academy (hoy oculta el card); modo social
  solo nightlife. Filtrar por prefijo de key o category? → añadir `scope` al Badge?
  Decisión: filtrar por set de keys academy en el front (catálogo conocido).
- Spec rules.spec.ts + tests de las reglas.

### T5 — `/perfil/datos`: nombre + teléfono editables
- `UpdateMeDto` + `name` (1-80, trim) y `phone` (E.164-laxo `^\+?[0-9\s-]{8,17}$`,
  null limpia). UI: filas editables como instagram (Editar→Guardar/Cancelar).

### T6 — ProducerPulse "últimos 30d"
- Si `upcoming === 0`: agregar eventos con `endsAt` en últimos 30d →
  sold/gross/checkins del período; caption cambia a "Últimos 30 días".

### T7 — Fixes menores
- i18n: agregar `practices.startsAt` (key faltante real — texto roto).
- Dev DB: `active=false` a academias test ("*Test", "PL Test").

### T8 — Sweep `min-h-dvh` (subagent)
- ~60 páginas app. Regla: quitar `min-h-dvh` del `main`/wrapper de contenido
  normal; CONSERVAR en estados de centrado vertical (loading/error/unauth con
  flex center/place-items) y superficies full-viewport intencionales
  (mapa/scanner/qr). tsc como verificación.

### T9 — Docs + verificación final
- openapi/postman regen, architecture.md si cambia, handoff.
- tsc api+web, smoke endpoints, detector, i18n-audit.

## Verificación por task
tsc web+api tras cada task; smoke donde aplique; detector en UI tocada.
