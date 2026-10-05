# Tasks

1. [x] Aplicar la tabla verbatim de `design.md` a los literales
   `title`/`body` en: `payments/application/payment-settlement.service.ts`,
   `payments/application/subscriptions.service.ts`,
   `academies/infrastructure/classes.controller.ts`,
   `academies/infrastructure/private-lessons.controller.ts`,
   `events/infrastructure/table-reservations.controller.ts`,
   `payments/infrastructure/tickets.controller.ts`,
   `social/infrastructure/waitlist.controller.ts`,
   `social/infrastructure/friends.controller.ts`,
   `sessions/infrastructure/sessions.controller.ts`,
   `admin/infrastructure/admin.controller.ts`.
2. [x] Agregar test de convención: titles ≤ 40 chars (sin interpolar) y sin
   punto final — helper que recorra los literales conocidos o spot-checks
   en los specs de los controllers tocados.
3. [x] `pnpm --filter @omnidance/api exec tsc --noEmit` + specs de los
   módulos tocados (`payment-settlement`, `private-lessons`,
   `classes`, `subscriptions`, `waitlist`).
4. [x] Verificar que ningún `type`/`category`/`data` cambió — diff solo
   literales de copy.
