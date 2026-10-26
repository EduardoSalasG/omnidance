# academy-billing Specification

## Purpose
TBD - created by archiving change academy-saas-billing. Update Purpose after archive.

## Requirements

### Requirement: Catálogo de tiers

El sistema SHALL ofrecer tiers de suscripción de academia con límite
de alumnos activos y precios por ciclo de facturación.

- **COBROS** - cobranza pura, hasta 60 alumnos activos.
- **STUDIO** - operación completa, hasta 150.
- **PRO** - analítica y CRM, sin límite.
- **ENTERPRISE** - sin límite, contratación manual (no
  auto-seleccionable). STARTER queda legacy no auto-contratable.

Los precios por tier y ciclo (mensual, semestral −8% sobre el mensual,
anual −15% sobre el mensual) SHALL resolverse por país del actor desde
el price book `TierPrice(tierCode, ACADEMY, billingCycle, countryCode)`
— cayendo a la fila `CL` y luego al param legacy
`academy_tier.*_monthly_clp` para ajuste sin deploy. "Alumnos
activos" SHALL ser `Enrollment` en `ACTIVE|TRIAL|ONLINE` de la
academia.

#### Scenario: Alumnos activos como medida

- **GIVEN** una academia con 47 enrollments ACTIVE, 2 TRIAL y 10
  EXPIRED
- **THEN** su conteo de alumnos activos es 49.

#### Scenario: Precio por país de la academia

- **GIVEN** una academia en `Country("MX")` con fila
  `TierPrice(STUDIO, ACADEMY, MONTHLY, MX)`
- **WHEN** el owner abre la pantalla de suscripción
- **THEN** ve el precio de la fila MX en MXN — no el param CLP

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

### Requirement: Entitlements por tier de academia

Cada módulo de la consola SHALL mapear a un tier mínimo: COBROS =
cobranza + estado de alumnos solamente; STUDIO = operación completa
(clases, reservas, asistencia, staff, exports, check-in); PRO =
analítica, CRM, campañas, videos, insights, multi-academia. Un request
a módulo sin tier SHALL responder 403 `{error:"tier.required",
upgrade:true, requiredTier}`. Admins y alumnos nunca se gatean. Cuentas
existentes migran a STUDIO por defecto.

#### Scenario: COBROS sin clases

- **WHEN** una academia COBROS llama a crear clase o marcar asistencia
- **THEN** recibe 403 tier.required con requiredTier STUDIO

#### Scenario: Nav filtrado por tier

- **WHEN** la consola academia carga con tier COBROS
- **THEN** solo se listan cobros/membresías/alumnos; el resto no se
  enlaza ni responde
