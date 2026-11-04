# academy-console Specification

## Purpose
TBD - created by archiving change academy-tier-v2. Update Purpose after archive.

## Requirements

### Requirement: Gating fino de features en superficies compartidas

El sistema SHALL ocultar (no solo bloquear) campos/secciones según
features del tier: score y clasificación CRM requieren `crm`;
asistencia en detalle de alumno requiere `attendance`; insights de
audiencia en home requieren `insights`; "clases de hoy" requiere
`classes`; consultas rápidas requieren `analytics`; crear academia
requiere `multiAcademy` (también server-side en POST /academies).

#### Scenario: COBROS sin leak en card de alumno

- **GIVEN** academia COBROS **WHEN** abre /academia/alumnos **THEN**
  las cards no muestran score ni clasificación CRM; el detalle no
  muestra asistencia; el home no muestra insight de audiencia ni
  clases de hoy

#### Scenario: Crear academia solo en tier PRO

- **GIVEN** academia STUDIO **WHEN** intenta POST /academies o abre
  /academia/nueva **THEN** la API responde 403 tier.required y el CTA
  no se muestra

### Requirement: Reporte de cobranza de academia

El sistema SHALL ofrecer a cualquier tier un reporte mensual:
facturación del mes, alumnos que pagaron, plan más vendido y filtros
por período/plan/estado.

#### Scenario: COBROS ve su facturación

- **GIVEN** academia COBROS con cobros del mes **WHEN** abre el
  reporte **THEN** ve total facturado, lista de pagantes, plan top y
  filtros funcionales

### Requirement: URLs de Configuración coherentes con su título

Las sub-páginas de `/academia/configuracion/*` SHALL tener un slug
acorde al título que muestran en el drawer y en la página:
`clases` (valores por defecto de clases), `metodos-de-pago`,
`niveles`, `perfil`, `apariencia`, `importar`, `suscripcion`. Las
rutas anteriores (`general`, `pagos`, `/academia/suscripcion` raíz)
SHALL redirigir a las nuevas para no romper deep-links.

#### Scenario: URL matchea título

- **WHEN** el owner abre "Clases" en el grupo Configuración del
  drawer
- **THEN** la URL es `/academia/configuracion/clases`

#### Scenario: Deep-link viejo de pagos

- **WHEN** se navega a `/academia/configuracion/pagos` (o una
  subruta)
- **THEN** se redirige al equivalente en
  `/academia/configuracion/metodos-de-pago`

### Requirement: Consistencia de superficies de consola

Toda página de la consola de academia SHALL seguir el patrón
unificado (crear = CTA a página dedicada; cards navegables
clickeables con chevron de affordance; ficha concentra
datos+edición+acciones; destructivo en zona roja centrada con
ConfirmSheet; un `h1` efectivo por página vía ConsoleHeader/appbar;
estados loading/error/empty/forbidden explícitos con skeletons; touch
targets ≥44px) y SHALL leerse correctamente en mobile (≥320px) y
desktop.

#### Scenario: Listado sin anti-patrones

- **WHEN** se audita cualquier listado de la consola
- **THEN** cada item navegable es un Link con chevron derecho, los
  estados de carga usan skeleton (no spinner desnudo), y la grilla
  responde entre 320px y desktop sin overflow
