# Design — role-console-polish

## Modelo

`AcademyInstructor.commissionPct Int?` — % que la academia retiene del
precio de cada clase particular del instructor. `PrivateLesson.
commissionPct` ya existe y pasa a ser el **snapshot** del valor vigente
al momento de la solicitud (los cambios del owner no retroactúan — mismo
principio que `Ticket.listPrice`).

## API

### `PATCH /academies/:id/instructors/:personId`

```
Body: { commissionPct: int 0..100 }
Auth: SessionGuard + requireAdminister (owner/ADMIN — no instructor)
→ 200 AcademyInstructor actualizado
```

404 si el `(academyId, personId)` no es instructor de la academia. No
audita en AuditLog: es un parámetro de negocio del owner sobre su propia
academia, no una acción admin de plataforma (consistente con
`PATCH :id/settings` que tampoco audita).

### `POST /academies/:id/private-lessons` (existente)

`commissionPct: instructor.commissionPct ?? 0` en el create — el único
cambio es leer el campo ya cargado del `academyInstructor.findFirst`.

### `GET /private-lessons/mine?as=instructor` (existente)

Cada fila agrega:

```
commissionClp = round(price * commissionPct / 100)
netClp        = price - commissionClp
```

Solo en la rama `as=instructor`; `as=student` queda byte-idéntico
(el alumno no debe ver la comisión — es un acuerdo academia↔instructor).

### `GET /academies/:id` (manage, existente)

`academy.instructors` (hoy `personId` solamente) pasa a incluir
`commissionPct` — la vista staff lo necesita para editar. `GET
/academies/:id/profile` (público autenticado) NO lo expone.

## UI

### `PrivateLessons` (`/academia/particulares`)

Sección nueva "Mis clases como instructor" entre la vista staff y la
vista alumno:

- fetch `/private-lessons/mine?as=instructor` en paralelo con el resto;
  si el array viene vacío la sección no se monta (invisible para alumnos
  puros).
- Header: "Este mes: $X neto" (suma de `netClp` de lecciones
  CONFIRMED/DONE del mes en curso — REQUESTED aún no es ingreso
  comprometido, CANCELLED jamás).
- Fila: fecha, alumno (resuelto igual que la vista staff via nombres del
  join o `mine` — ver nota), badge de estado, `precio`, `comisión X%
  (−$Y)`, `neto $Z`.

`mine` no devuelve nombres de alumno (join solo existe en la vista
staff) — para v1 la fila instructor muestra fecha/estado/montos sin
nombre del alumno (lo sabrá por su agenda); si el viewer además es staff
de la academia, la lista staff ya le da los nombres. (Declarar gap:
endpoint de detalle del instructor con nombre del alumno — no
privacidad-crítico pero mejorable.)

### Settings de academia

`AcademySettings` (card owner/admin) gana subsección "Instructores":
lista `academy.instructors` del `GET /academies/:id` (que ya fetchea la
página) con nombre + input numérico de comisión % + save por fila
(`PATCH` + refetch). Instructor sin comisión → `—` / 0.

## Riesgos

- Redondeo CLP: `Math.round` (enteros siempre).
- Snapshot vs vigente: documentado — cambiar commissionPct no toca
  lecciones ya creadas (el neto mostrado usa el snapshot de la fila,
  correcto).
- Privacidad: la comisión es del acuerdo academia↔instructor — visible
  para owner, admin y el propio instructor; nunca para el alumno ni en
  `/profile`.
