# Handoff - 2026-09-28 (c): role consoles - drop-in checkout, producer exports, instructor commission

Sesión sobre `dev` continuando el programa de réplica de patrones dancer →
otros roles (aprobado por el usuario: "procede con todo"). Tres changes
OpenSpec: `class-dropin-checkout` (ya implementado en la sesión previa a
la compactación), `producer-exports` y `role-console-polish`.

## Estado

- API :4000 corriendo (`node dist/main.js`, build fresco).
- Postgres/Redis docker healthy (:5433/:6379).
- Suite completa verde: **52 archivos / 1197 tests** (63s).
- `tsc --noEmit` api + web limpios; `nest build` OK.
- `openspec validate --strict`: `class-dropin-checkout`,
  `producer-exports` y `role-console-polish` válidos.
- `docs/openapi.json` + postman regenerados (188 requests).

## Change 2 - producer-exports (implementado + verificado)

- `GET /events/:id/export.csv?dataset=sales|checkins|guestlist` en
  `EventsController` - owner del evento o `admin.access` (mismo
  `requireOwnerOrAdmin` que `/live`). BOM UTF-8 + CRLF + escaping real;
  `Content-Disposition: attachment`.
  - `sales`: fila por Ticket (fecha, comprador, asistente, precio, fee,
    total, estado, canal desde `Payment.channel`, payment_id). **Nunca
    `claimToken`** ni ids internos de persona.
  - `checkins`: incluye anulados (`anulado=si`), nota del staff.
  - `guestlist`: fila por `GuestListEntry` con label/dueño/invitado.
- Web: `components/producer/export-section.tsx` - tres links
  `/api/events/…` con `download` (NavPendingOverlay ya respeta
  `a[download]`), montado bajo `canManage` en `/productor/eventos/[id]`.
- Smoke live verificado: owner 200 con CSV real, stranger 403, admin 200,
  sin sesión 401, dataset inválido 400, evento inexistente 404, BOM en
  bytes (`ef bb bf`).
- Fuera de scope v1: export por serie, PDF, dataset de mesas.

## Change 3 - role-console-polish (implementado + verificado)

`role-console-depth` ya estaba cerrado (tasks `[x]`, commiteado) - el
residual era la comisión del instructor:

- `AcademyInstructor.commissionPct Int?` + migración
  `20260928170000_instructor_commission` (aplicada).
- `PATCH /academies/:id/instructors/:personId {commissionPct 0-100}` -
  `requireAdminister` (owner/ADMIN), 404 instructor inexistente.
- `POST /academies/:id/private-lessons` - snapshot del commissionPct
  vigente a la lección (no retroactivo).
- `GET /private-lessons/mine?as=instructor` - agrega `commissionClp` +
  `netClp` por fila. Rama student **no expone** `commissionPct` ni los
  calculados (privacidad del acuerdo academia↔instructor). En
  `GET /academies/:id/private-lessons` (staff) un instructor solo ve
  comisión de sus propias clases; owner/admin ven todo.
- `GET /academies/:id` (manage) incluye `instructors[].commissionPct`;
  `/profile` público NO lo expone.
- Web: `PrivateLessons` gana sección "Mis clases como instructor"
  (fetch `as=instructor`, solo si hay filas) con precio/comisión/neto
  por clase y "Neto del mes" (CONFIRMED+DONE del mes en curso).
  `AcademySettings` gana subsección de instructores con comisión
  editable (owner/admin - fetch manage solo cuando ya se sabe que es
  owner, no se filtra el manage a instructores puros).
- Seed dev: vale 25% en MuéveteOnTour, rodrigo 30%, tumbao/vale null.
- Smoke live: PATCH owner 200 / stranger 403 / rango 400 / snapshot 25
  / instructor mine con netClp 30000 / alumno sin campos de comisión.
- Spec nuevo `private-lessons.controller.spec.ts` (6 tests).

## Gaps conocidos declarados

- Exporte por serie + PDF: pendiente de UX real.
- Liquidación monetaria de la comisión del instructor (PrivateLesson no
  tiene Payment asociado - la comisión es informativa hasta que exista
  cobro online de particulares).
- `mine?as=instructor` no resuelve el nombre del alumno (gap declarado
  en design.md de role-console-polish).
- Refinar flujo de inscripción+pago del dancer: pendiente explícito del
  usuario.
- Validación Flow sandbox real (credenciales + tarjeta + browser):
  sigue bloqueando producción por diseño.
