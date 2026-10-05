# Handoff - 2026-09-24 - Cierre de pendientes Academy + perfil + sweep

## Commits de la sesión (en orden, sobre dev)

- `cc09395` academies: `instagram`/`whatsapp` en schema + `PATCH /academies/:id/settings` extendido (description, address, lat/lng, instagram, whatsapp - normaliza handle IG y dígitos wa.me) + `GET /:id/profile` expone contacto.
- `e158478` consola `/academia`: nuevo card `AcademyProfile` (edición del perfil público, guard owner/ADMIN igual que `AcademySettings`) + CTAs Instagram/WhatsApp en ficha `/academias/[id]`.
- `fc4a0ec` insignias academy: `BadgeStats` +3 campos (classAttendances, academyStreakWeeks, distinctAcademies), `attendancesForPerson` devuelve academyId vía join class→slot, 4 reglas nuevas en `BADGE_RULES`, 4 badges en `BADGE_CATALOG` (seedeados). `/perfil` muestra insignias del modo activo filtradas por `ACADEMY_BADGE_KEYS`.
- `ac8554a` sweep `min-h-dvh`: 45 ocurrencias quitadas en 38 páginas (subagent). Conservadas en estados centrados (loading/error/unauth) y superficies fullscreen (qr, staff/[id], mapas, checkout success).
- `bc97de2` `PATCH /me` acepta name (no vacío) + phone (normaliza separadores, `+` conservado, `^\+?[0-9]{8,15}$`); `/perfil/datos` edita nombre/teléfono/instagram en un solo guardado - componente `EditField` nuevo.
- `412b9f7` `ProducerPulse`: sin eventos activos → fallback "Últimos 30 días" agregando eventos cerrados recientes.
- `717f553` i18n: `practices.startsAt` (key real faltante - label del input date en consola academia).
- Plan: `docs/superpowers/plans/2026-09-24-cierre-pendientes.md`.

## Verificado

- tsc api + web limpios; vitest rules.spec.ts 72/72 (incluye 4 tests academy + 2 buildBadgeStats).
- Smoke vivo (scripts/.tmp-smoke-perfil.cjs, borrado tras uso): PATCH /me name+phone persiste y normaliza; name vacío / phone inválido / ig inválido → 400; PATCH settings no-owner → 403, owner → 200 con ig/wsp normalizados; profile público expone contacto; **badges academy lazy-awarded en vivo** (Camila: primera_clase, alumno_constante, racha_academia).
- i18n-audit: ALL_KEYS_OK. Impeccable detect: `[]`. openapi/postman regenerados (170 paths). architecture.md actualizado.
- Data dev: 6 academias "Test"/"Nueva Test"/"PL Test" desactivadas (`active=false`, no borradas).
- Auditoría venue-nullable cerrada: solo `/staff` faltaba (consume `/events` público) - fix aplicado. Rentals/venue-dashboard/locales tienen venue garantizado por contexto.

## Decisiones de producto tomadas

- Contacto academia: Instagram + WhatsApp (usuario eligió). Web externa quedó fuera.
- Foto de perfil: NO implementada - no hay storage en el repo y la regla es "fotos nunca se hostean" (Person.photoUrl existe pero no hay upload flow). Pendiente hasta decisión de storage.
- Migraciones: sigue flujo `db push` (no existe `prisma/migrations/`; AGENTS lo permite).

## Pendiente conocido

- Upload de foto de perfil (requiere storage/decisión de producto).
- `explorador_academias` requiere ≥3 academias - en dev Camila llegó a racha_academia pero no a explorador (esperado con la data actual).
- Los tests e2e Playwright no se corrieron (dev web server no estaba arriba; tsc+smoke API cubrieron).
