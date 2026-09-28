# Handoff — 2026-09-28d — `private-lesson-product`

## Qué se hizo

La clase particular pasó de "solicitud del alumno" a **producto comprable de la academia**, junto a los planes en el perfil público:

- `Academy.privateLessonPrice Int?` (null = no vende) editable en `PATCH /academies/:id/settings` y expuesto en `GET /academies/:id/profile`.
- `PrivateLesson.instructorId/scheduledAt` ahora nullables + `paymentId` — migración `20260928200000_private_lesson_product`.
- Checkout: `GET /checkout/private-class-quote` + `POST /checkout/private-class` → orden `PRIVATE` (`refId pvt_<academyId>_<uuid>`), precio del academy + `service_fee.membership_clp`.
- Settle PRIVATE → `PrivateLesson` REQUESTED **sin instructor ni fecha**, idempotente, FAILED no crea; notifica al alumno (`payment.paid`) y al owner (`academy.private_lesson.purchased`).
- `PATCH /private-lessons/:id {action:"assign", instructorId, scheduledAt}` — solo owner/admin → CONFIRMED + snapshot `commissionPct` del instructor + notifica alumno e instructor (`academy.private_lesson.assigned`).
- `POST /academies/:id/private-lessons` ahora **staff-only** (clases manuales; `personId` opcional = el alumno). Alumno → 403.
- Joins de list/staff null-safe; payouts `by-academy` y generate incluyen PRIVATE vía `pvt_` (academia directa, incluso sin eventos/planes/clases — se eliminó el early-return para ACADEMY).
- Web: card "Clase particular" en `/academias/:id` cuando `privateLessonPrice>0` (`BuyPrivateClass` → POST → redirect `paymentUrl`); `/clases` sin el fallback de particular; `/clases/particular` = bandeja de estado sin form de solicitud; `/academia/particulares` staff con form assign (instructor+fecha); `AcademySettings` campo precio; `/checkout/return` PRIVATE → `/clases/particular`.
- Seed: MuéveteOnTour $25.000, Academia Tumbao $20.000 (backfill `??`, no pisa ediciones).

## Verificación

- Suite API: **52 archivos, 1181 tests verde** (tras fix del e2e `gap-academies2`: NotificationsModule en el TestModule + POST staff-only, más 3 tests nuevos de assign). Payouts spec +2 tests PRIVATE.
- `tsc --noEmit` api + web limpio. `openspec validate --strict` válido.
- `openapi.json`/`postman` regenerados (190 paths).
- Seed aplicado; smoke live (`scripts/smoke-private-lesson.cjs`): profile expone precio, quote {listPrice 25000 + fee 500 = 25500}, academia sin precio → 400, compra → orden PRIVATE `pvt_`, alumno POST → 403, assign owner → CONFIRMED + notif, assign instructor → 403.
- **Brecha declarada**: `next build` falla en prerender de `/practicas` (useSearchParams sin Suspense — commit `f0547fc`) y `/twitter-image` (env site URL) — **preexistentes**, no de este change. Compilación y typecheck del build pasan.

## Pendientes

1. Flujo de inscripción+pago del dancer (declarado antes).
2. Validación Flow sandbox real (credenciales + tarjeta + checkout browser) — bloquea producción.
3. Reembolso de la particular cancelada por el alumno aún sin asignar (hoy CANCELLED sin devolución automática).
4. Fix build web: suspense boundary en `/practicas` + URL de site para `twitter-image`.
