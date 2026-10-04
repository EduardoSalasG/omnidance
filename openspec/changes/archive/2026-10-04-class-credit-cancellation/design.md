# Diseño — créditos de clase + cancelación con corte

## Modelo de datos (migración)

```prisma
model MembershipPlan {
  // …
  classCount     Int?  // CLASS_PACK: total de clases del pack
  weeklyClasses  Int?  // NUEVO: clases/semana ISO (planes por tiempo); null = ilimitado
}

model ClassBooking {
  // …
  enrollmentId String?   // NUEVO: inscripción que consumió el crédito
  cancelledAt  DateTime? // NUEVO
  refunded     Boolean   @default(true) // NUEVO: el cancel devolvió el crédito
}
```

`refunded` default `true`: las filas históricas migradas se tratan como
devueltas (no punitivo) y, en todo caso, la cuota semanal solo mira la semana
de la clase objetivo, así que la historia no afecta el conteo actual.

## Semana

ISO lun–dom sobre `Class.date` (que ya se materializa a medianoche UTC del
día de la clase). No se usa hora local: la diferencia solo aparecería en una
clase que cruza el lunes 21:00 hora Chile — caso prácticamente inexistente.

## Conteo de consumo

Una reserva consume crédito si `status = BOOKED` o `status = CANCELLED AND
refunded = false`. `WAITLIST` no consume (ocupa posición en cola, nada más).

La consulta de uso es por `(personId, academyId, rango de semana)` sobre
`ClassBooking` — no por `enrollmentId` (que queda como auditoría de qué
inscripción respondió). Esto mantiene el conteo correcto aunque existan
inscripciones solapadas en la misma academia.

## Resolución del plan que responde

En `book()`, tras la verificación de inscripción vigente existente:

1. Cargar inscripciones vigentes (`BOOKABLE_ENROLLMENT`) del alumno en la
   academia con `plan` (type, weeklyClasses, classCount).
2. Candidatos en orden de preferencia: plan semanal con `weeklyClasses`
   → pack `CLASS_PACK` con `classCount` → ilimitado.
3. El primero con saldo responde; si hay candidatos pero todos agotados →
   `409 "agotaste tus clases de esta semana"` (o del pack). Si ninguna
   inscripción tiene cuota definida y hay una ilimitada → reserva libre.

## Promoción de waitlist

`promoteWaitlist(tx, classId)`: itera los `WAITLIST` por `createdAt`; para
cada candidato evalúa si tiene crédito (misma consulta de uso, dentro de la
tx); promueve el primero con saldo y le notifica `class.waitlist.promoted`;
si nadie tiene saldo, la cola queda intacta.

## Corte de cancelación

`ParamsService.getNumber("classes.cancel_refund_minutes", 60)`. Inicio de la
clase = `Class.date` (medianoche UTC) + `slot.startTime` "HH:mm".
`refunded = now <= start − cutoff`. La respuesta del DELETE incluye
`{status:"CANCELLED", refunded}` para que el UI declare la consecuencia.

## Cascada academia

`deactivate` de serie y `deleteSlot` ya hacen `updateMany` de bookings a
`CANCELLED`; ahora setean también `cancelledAt` y `refunded=true`.

## API

- `GET /classes/:id` → `myCredits: {kind:"WEEKLY"|"PACK", used, limit} | null`.
- `POST /classes/:id/book` → 409 cuando la cuota está agotada (solo BOOKED;
  la entrada a WAITLIST no exige cuota).
- `DELETE /classes/:id/book` → `{id, status, refunded, cancelledAt}`.
- DTO de planes (create + PATCH): `weeklyClasses?: number | null`.

## UI dancer

- `class-booking-cta.tsx`: chip "N de M esta semana" cuando `myCredits` es
  WEEKLY (o "N restantes del pack"); el sheet de cancelar usa dos copies
  según el tiempo restante al corte; el aviso post-cancel usa
  `t("cancelledRefund")` / `t("cancelledForfeit")`.
- Ficha de clase (server): pasa `myCredits` al CTA.
- `/clases`: chip de créditos junto al header de la sección.
- Consola academia `plans-section.tsx`: campo "clases por semana" en el
  form de planes recurrentes (oculto/deshabilitado en ilimitado/pack).

## Riesgos

- **Datos existentes**: reservas viejas sin `enrollmentId`/`refunded` no
  distorsionan cuotas (semana acotada; default refunded=true).
- **Doble reserva concurrente**: el conteo va dentro de la tx existente de
  `book()` — Postgres serializa por la fila única `(classId, personId)`; el
  conteo por semana puede tener race entre dos clases distintas reservadas a
  la vez — se acepta (peor caso: una reserva extra en la semana), o se añade
  advisory lock por `(personId, academyId)` si la revisión lo exige.
