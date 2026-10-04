# Capability: academy-billing

Suscripción SaaS del dueño de academia — tiers por alumnos activos,
ciclos mensual/semestral/anual, trial, gracia y bloqueo por mora.

## ADDED Requirements

### Requirement: Catálogo de tiers

El sistema SHALL ofrecer tiers de suscripción de academia con límite
de alumnos activos y precios por ciclo de facturación.

- **STARTER** — hasta 50 alumnos activos.
- **PRO** — hasta 150.
- **STUDIO** — hasta 400.
- **ENTERPRISE** — sin límite, contratación manual (no
  auto-seleccionable).

Los precios por tier y ciclo (mensual, semestral −10%, anual −15%)
SHALL vivir en `PlatformParam` para ajuste sin deploy. "Alumnos
activos" SHALL ser `Enrollment` en `ACTIVE|TRIAL|ONLINE` de la
academia.

#### Scenario: Alumnos activos como medida

- **GIVEN** una academia con 47 enrollments ACTIVE, 2 TRIAL y 10
  EXPIRED
- **THEN** su conteo de alumnos activos es 49.

### Requirement: Trial de onboarding

Una academia nueva SHALL recibir 30 días de trial sin exigir tarjeta
upfront. Las academias existentes al despliegue SHALL recibir un grace
de lanzamiento de 60 días.

#### Scenario: Trial sin cobro

- **GIVEN** una academia creada hoy **THEN** `trialEndsAt` = +30d y su
  consola opera completa sin suscripción.

### Requirement: Contratación y cambio de plan

El owner SHALL poder suscribirse a un tier con ciclo
MONTHLY/SEMIANNUAL/ANNUAL vía checkout Flow de suscripción (el mismo
motor `Subscription` de las membresías). Al suscribir o bajar de tier,
si `activeStudents > tier.max` el sistema SHALL rechazar con 400 y
copy honesto. Un upgrade SHALL aplicar inmediato; un downgrade SHALL
aplicar al inicio del próximo ciclo.

#### Scenario: Suscripción excede límite

- **GIVEN** academia con 160 alumnos activos **WHEN** intenta
  suscribirse a PRO (max 150) **THEN** 400 con mensaje que indica el
  exceso y las opciones (depurar alumnos o subir a STUDIO).

### Requirement: Gracia y bloqueo por mora

Si una factura queda impaga, la academia SHALL tener 5 días calendario
de gracia (`billingGraceUntil`) con aviso en consola. Vencida la
gracia el sistema SHALL marcar `billingBlockedAt` y bloquear: la
consola queda read-only (mutaciones 403), la academia desaparece de
explorar y del directorio, sus clases dejan de ser reservables y su
checkout rechaza compras. El alumno SHALL ver copy honesto ("la
academia no está disponible") sin perder su historial. Un
`RENEWAL_SETTLED` SHALL limpiar `billingBlockedAt` automáticamente.

#### Scenario: Día 6 bloqueada

- **GIVEN** academia con invoice impaga hace 6 días **THEN** owner 403
  en mutaciones, invisible en `GET /academies`, y `POST
  /classes/:id/book` de su serie responde que la academia no está
  disponible.

#### Scenario: Pago recupera el acceso

- **GIVEN** academia bloqueada **WHEN** llega `RENEWAL_SETTLED` de su
  suscripción **THEN** `billingBlockedAt` se limpia y todo vuelve.

### Requirement: Visibilidad del estado de facturación

`GET /academies/:id/billing` SHALL devolver tier actual, alumnos
activos vs límite, ciclo, próxima facturación, días de gracia
restantes e historial de invoices (del ledger de la suscripción).

#### Scenario: Estado visible para el owner

- **GIVEN** academia PRO con 120/150 alumnos activos **WHEN** el owner
  abre `GET /academies/:id/billing` **THEN** ve tier PRO, 120/150,
  fecha de renovación e invoices previos.

### Requirement: Cancelación

El owner SHALL poder cancelar; la suscripción SHALL seguir activa
hasta el fin del ciclo ya pagado y luego la academia entra a la lógica
de bloqueo (sin grace adicional post-cancelación confirmada).

#### Scenario: Cancelar respeta lo pagado

- **GIVEN** academia con ciclo pagado hasta el 20 **WHEN** cancela el
  10 **THEN** opera completa hasta el 20 y el 21 pasa a bloqueo.
