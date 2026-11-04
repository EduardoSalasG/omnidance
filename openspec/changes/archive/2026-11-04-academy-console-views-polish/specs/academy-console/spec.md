# Delta: academy-console

## ADDED Requirements

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
