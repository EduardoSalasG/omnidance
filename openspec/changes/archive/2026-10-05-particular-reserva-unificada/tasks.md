# Tasks — particular-reserva-unificada

- [x] API `GET /classes/mine`: merge `privateLesson` activas
     (REQUESTED/CONFIRMED) en la respuesta — fila compatible con el
     card (`series:null`, `date` ISO-medianoche-UTC o `null`,
     `myBooking:"BOOKED"`, capacity 1, academy con billingBlocked,
     instructor {id,name}|null)
- [x] API `GET /classes/mine?scope=past`: merge terminales
     (DONE→"attended", CANCELLED→"cancelled") en el historial
- [x] API `GET /private-lessons/:id`: detalle para personId dueño,
     instructor asignado, owner de la academia o admin — shape
     {id,status,scheduledAt,price,academy{id,name},instructor|nul…};
     comisión solo a owner/instructor/admin
- [x] API `GET /private-lessons/mine`: rama alumno retirada — solo
     `?as=instructor` (una sola fuente de reservas del learner)
- [x] Specs del controller: cubrir merge en mine + past + el GET :id
     (permisos: ajeno → 403; comisión oculta al alumno)
- [x] Web `class-card.tsx`: `LessonCardData` (`series:null`, date/
     startTime nullables) + unión `MineCardData`; card renderiza
     título `classes.privateLesson` cuando `series` es null
- [x] Web `/clases`: quitar fetch de `/private-lessons/mine`, union
     `ReservedItem`, `renderLessonCard`, `cancelLesson` — filas
     `date:null` van al grupo "Por agendar"; `renderClassCard` para
     todo; dots del calendario con genre null
- [x] Web `/clases/[id]`: fallback `GET /private-lessons/:id` cuando
     la clase 404; ficha lesson con mismo layout + zona destructiva
     de cancelación (sheet confirm → PATCH → router.refresh)
- [x] Componente cancel de lesson (cliente, patrón del pie
     destructivo de ClassBookingCta)
- [x] i18n: `classes.privateLesson` + keys del detalle; audit
     ALL_KEYS_OK
- [x] Verificación: tsc api+web, vitest specs tocados, impeccable
     detect, openspec validate — pendiente smoke manual con sesión
     real
