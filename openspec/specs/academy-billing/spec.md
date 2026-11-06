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
- **THEN** ve el precio de la fila MX en MXN; no el param CLP

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

El gate client-side de la consola (`AcademyTierGate`) SHALL derivar la
feature del `tier` de la academia seleccionada, que viaja en
`GET /academies/mine` para owner, staff e instructor por igual - el
mismo criterio para cualquier miembro del equipo, no solo para el
owner. El paywall es comunicación de upsell al owner; para staff e
instructor la restricción real la impone el 403 del API.

Las superficies de navegación de la consola SHALL aplicar el mismo
criterio: el drawer/sidebar del owner filtra ítems por `academyFeature`
y la grilla de módulos del hub `/academia` (superficie de staff,
instructor y ADMIN) filtra cards por feature del tier de la academia
seleccionada, además del capability del miembro. Cuando la selección
persistida apunta a una academia que el viewer no posee (membresía
instructor/staff) y su tier no es resoluble en cliente, el filtro del
nav SHALL no recortar - las páginas y el API gatean.

Los puntos de entrada transversales SHALL no aterrizar en una
superficie gated cuando exista un destino equivalente disponible en
todos los tiers: `/academia/configuracion` SHALL redirigir a
`configuracion/perfil`. El alias legado `configuracion/general`
(renombrado de la página de defaults de clases) SHALL seguir
redirigiendo a `configuracion/clases` - quien entra por ese deep-link
pide esa página y, si su tier no la cubre, ve su TierPaywall
informativo, no un destino sustituto.

#### Scenario: COBROS sin clases

- **WHEN** una academia COBROS llama a crear clase o marcar asistencia
- **THEN** recibe 403 tier.required con requiredTier STUDIO

#### Scenario: Staff de academia STUDIO abre series

- **GIVEN** una academia con tier STUDIO y un staff con cap `schedule`
- **WHEN** el staff abre `/academia/series`
- **THEN** el gate client-side no muestra paywall y el contenido carga

#### Scenario: Staff de academia COBROS abre series

- **GIVEN** una academia con tier COBROS y un staff con cap `schedule`
- **WHEN** el staff abre `/academia/series`
- **THEN** ve el paywall "parte del plan STUDIO" (y el API respondería
  403 tier.required si lo intentara por otra vía)

#### Scenario: Nav filtrado por tier

- **WHEN** la consola academia carga con tier COBROS
- **THEN** solo se listan cobros/membresías/alumnos; el resto no se
  enlaza ni responde

#### Scenario: Grilla del hub filtrada por tier

- **GIVEN** un staff de una academia COBROS con cap `schedule`
- **WHEN** abre el hub `/academia`
- **THEN** la grilla lista solo los módulos que su cap y el tier cubren
  (alumnos, planes, promos, cobros, configuración, suscripción); las
  cards de series, particulares, videos, preventas, equipo y CRM no se
  muestran

#### Scenario: Entrada a configuración en COBROS

- **GIVEN** una academia COBROS
- **WHEN** alguien con acceso abre `/academia/configuracion`
- **THEN** aterriza en `configuracion/perfil` (disponible en su tier),
  no en un paywall

#### Scenario: Importar clases sin feature

- **GIVEN** una academia COBROS cuyo viewer tiene cap `schedule`
- **WHEN** abre `/academia/configuracion/importar`
- **THEN** ve la card de importación de alumnos pero no la de clases

#### Scenario: Detalle de horario por API en COBROS

- **GIVEN** una academia COBROS
- **WHEN** alguien llama `GET /academies/:id/slots/:slotId`
- **THEN** recibe 403 tier.required con requiredTier STUDIO (feature
  `classes`), igual que el listado de slots

#### Scenario: Niveles y cupos en STUDIO

- **GIVEN** una academia STUDIO
- **WHEN** el owner abre su inicio en modo Extendido
- **THEN** la card "Niveles y cupos por horario" carga con data
  (el endpoint `GET /academies/:id/insights/levels` exige `classes`,
  no `insights`: es planificación operativa, no analítica PRO)

#### Scenario: Niveles y cupos en COBROS

- **GIVEN** una academia COBROS
- **WHEN** el owner abre su inicio
- **THEN** la card "Niveles y cupos" no existe en la vista y el
  endpoint respondería 403 tier.required con requiredTier STUDIO

### Requirement: Paywall consistente en superficies gated de academia

Toda página de la consola de academia detrás de una feature de tier
SHALL mostrar `TierPaywall` (no un 403 genérico) en dos caminos:
proactivo (`AcademyTierGate` por `academy.tier`) y reactivo (403
`tier.required` del endpoint mapeado por `isTierRequired`). Las fichas
del equipo (`/academia/equipo/[id]` y sus ediciones, incluido
`equipo/profesor/[id]`) SHALL gatear `staff` igual que la lista y el
alta; el roster `/academia/clases/[id]` SHALL mapear el 403
`tier.required` a `TierPaywall` (feature `attendance`); las páginas de
configuración `clases` y `niveles*` SHALL gatear `classes`.

#### Scenario: COBROS abre ficha de colaborador

- **GIVEN** staff de una academia COBROS
- **WHEN** navega a `/academia/equipo/<id>`
- **THEN** ve `TierPaywall` (feature staff, CTA a suscripción), no un
  error genérico

#### Scenario: Roster de clase en academia sin asistencia

- **GIVEN** una academia cuyo tier no cubre `attendance`
- **WHEN** alguien con acceso abre `/academia/clases/<id>`
- **THEN** el 403 `tier.required` del roster muestra `TierPaywall`
