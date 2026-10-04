# Diseño — clase de prueba comprable

## Decisiones

1. **Mismo canal de compra**: TRIAL reusa `membership` checkout —
   ya existe quote+orden+webhook+enrollment. No es producto nuevo.
2. **`price > 0` requerido**: Flow no procesa órdenes de CLP 0; la prueba
   gratuita sigue por la vía staff (`POST /:id/enrollments` con TRIAL).
3. **Settle TRIAL nunca toca la inscripción vigente**: un alumno ACTIVE
   que compra una prueba conserva su ACTIVE — se crea una fila TRIAL
   aparte (no hay @@unique; el histórico está permitido). Regla: si
   `plan.type === "TRIAL"` → siempre `enrollment.create`, salta la lógica
   de extensión/update.
4. **`endsAt`**: `membershipEndsAt(plan, now)` — TRIAL con `periodDays`
   configurado expira; sin él queda indefinido (igual que el alta staff).
5. **`recurring`**: `RECURRING_PLAN_TYPES` no incluye TRIAL → el checkout
   ofrece solo compra única, sin UI nueva.
6. **Booking**: TRIAL ya está en `BOOKABLE_ENROLLMENT` — la alumna puede
   reservar apenas se materializa el enrollment (post-webhook PAID).

## Riesgos

- Doble TRIAL repetido: filas históricas acumuladas — aceptable, sin
  unique constraint por diseño.
- Un TRIAL comprado no cuenta como "alumna activa" para stats que exijan
  ACTIVE — coherente: es prueba.
