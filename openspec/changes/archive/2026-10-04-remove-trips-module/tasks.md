# Tasks

- [x] Web: eliminar `app/(app)/viajes/page.tsx` y `components/social/trip-matches.tsx`
- [x] BottomNav: quitar item del sheet social, label de ruta e icono `trips`
- [x] i18n: eliminar namespace `trips` y `nav.trips`; mover `until` a `availability.until` (AvailabilitySection)
- [x] `robots.ts`: quitar disallow `/viajes`
- [x] API: eliminar `trips.controller.ts` + registro en `SocialModule`
- [x] Dominio: eliminar `TripInput`/`assertTripInput` de `social.service.ts` (+ spec)
- [x] Schema: drop `model Trip` + `prisma db push` + generate
- [x] e2e: quitar describes de trips (`social.e2e`, `gap-passes-trips` → renombrado `gap-passes`)
- [x] Docs: regenerar `openapi.json` + Postman; actualizar `architecture.md`, READMEs, `omni-dance.md`
- [x] Verificación: tsc API+web limpio, `/api/trips/*` → 404
