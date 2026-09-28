# Tasks — private-lesson-product

## 1. Schema

- [x] 1.1 `Academy.privateLessonPrice Int?` +
  `PrivateLesson.instructorId/scheduledAt` nullable + `paymentId String?`;
  migración versionada + generate.

## 2. API (TDD)

- [x] 2.1 Tests rojos: `order-ref` pvt_; `privateClassQuote`/
  `purchasePrivateClass` (404/400/orden creada); `settlePrivateLesson`
  (REQUESTED sin instructor/fecha, idempotente, FAILED no crea);
  `assign` (owner 200→CONFIRMED+snapshot, 403 no-owner, 404 instructor
  ajeno, 409 estado inválido); POST request staff-only (alumno 403);
  settings.privateLessonPrice; profile lo expone; list tolera nulls.
- [x] 2.2 Implementar: order-ref, CheckoutService + rutas controller,
  settle rama PRIVATE + notify owner, action assign + notify alumno/
  instructor, null-safe joins, POST staff-only, DTO settings + profile.
- [x] 2.3 `paymentsByAcademy` + `withContextNames` incluyen PRIVATE
  (academia directa del refId — no viaja por Class).

## 3. UI

- [x] 3.1 `/clases`: remover `particularFallback` (ambos usos + helper +
  keys i18n `fallbackCta`/`fallbackAction`).
- [x] 3.2 `/academias/[id]`: card "Clase particular" en sección de planes
  cuando `privateLessonPrice>0` → client component que POSTea
  `/checkout/private-class` y redirige a `paymentUrl`.
- [x] 3.3 `PrivateLessons`: remover form de solicitud del alumno; "por
  agendar"/"por asignar" en nulls; staff: sección/form assign
  (instructor select + datetime) sobre REQUESTED sin instructor.
- [x] 3.4 `AcademySettings`: campo `privateLessonPrice` (owner).
- [x] 3.5 `/checkout/return`: PRIVATE → `/clases/particular`; i18n parts.

## 4. Cierre

- [x] 4.1 Seed: `privateLessonPrice` en academias demo; suite completa +
  `tsc` api/web + build.
- [ ] 4.2 `openspec validate --strict`; regen openapi/postman; docs
  (architecture/flows/omni-dance.md si aplica); handoff; commit.
