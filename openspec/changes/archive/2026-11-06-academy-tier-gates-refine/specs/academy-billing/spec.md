# Delta: academy-billing

## MODIFIED Requirements

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
