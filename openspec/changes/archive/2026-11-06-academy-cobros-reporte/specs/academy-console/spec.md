# Delta: academy-console

## MODIFIED Requirements

### Requirement: Reporte de cobranza de academia

El sistema SHALL ofrecer a cualquier tier un reporte de cobranza como
destino propio del owner: ítem "Reporte" en el drawer/sidebar bajo
"Cobros". La página SHALL mostrar KPIs del período filtrado ("Facturado"
y "Alumnos"), una sección "Métodos de pago" con un KPI por método y su
total cobrado, filtros por período/plan/estado y la lista de cobros como
cards legibles (nombre, plan, método de pago, fecha + monto y estado),
paginada 20 ítems en desktop y 10 en mobile.

#### Scenario: COBROS ve su facturación

- **GIVEN** academia COBROS con cobros del mes **WHEN** abre el
  reporte desde el drawer **THEN** ve total facturado, alumnos que
  pagaron, desglose por método de pago y filtros funcionales

#### Scenario: paginación responsiva

- **GIVEN** el reporte con más de 20 cobros **WHEN** el owner lo abre
  en desktop **THEN** cada página muestra 20; en mobile muestra 10

### Requirement: Consistencia de superficies de consola

Toda página de la consola de academia SHALL seguir el patrón
unificado: crear = CTA a página dedicada; cards/filas navegables
clickeables con `ChevronRightIcon` de affordance y
`hover:border-neon/60`; ficha concentra datos+edición+acciones con
datos en `<dl>` dentro de Card; destructivo en zona roja centrada
(`border-t border-line pt-6`, ghost rojo) con `ConfirmSheet`;
`ConsoleHeader` con `backHref`/`backLabel` al padre lógico en TODA
página, incluidas las raíces de sección del drawer; un `h1` efectivo
por página; estados loading/error/empty/forbidden explícitos con
skeletons; feedback de acción con `Spinner` inline inmediato (nunca
texto "Cargando…" como estado busy); referencias cruzadas a otras
entidades como `<Link>` a su ficha cuando el payload trae el id;
touch targets ≥44px; y SHALL leerse correctamente en mobile (≥320px)
y desktop.

Las fichas alcanzables desde más de una superficie SHALL respetar el
origen real de la navegación: los listados propagan `?from=<ruta>` y la
ficha usa `safeInternalPath(from)` como `backHref` y como destino de la
navegación post-acción, con fallback al padre lógico cuando el parámetro
falta o no es una ruta interna.

#### Scenario: Listado sin anti-patrones

- **WHEN** se audita cualquier listado de la consola
- **THEN** cada item navegable es un Link con chevron derecho, los
  estados de carga usan skeleton (no spinner desnudo), y la grilla
  responde entre 320px y desktop sin overflow

#### Scenario: Raíz de sección con back

- **WHEN** el owner abre una página raíz de la consola
  (`/academia/planes`, `/academia/promos`, `/academia/niveles`,
  `/analitica/usuarios`)
- **THEN** el `ConsoleHeader` ofrece navegación de vuelta al padre
  lógico (`/academia` o `/analitica`)

#### Scenario: Acción con feedback inmediato

- **WHEN** el usuario confirma un submit o una acción de ficha
- **THEN** el control muestra `Spinner` inline de inmediato, nunca un
  cambio de texto tipo "Cargando…" como única señal

#### Scenario: Referencia cruzada navegable

- **GIVEN** una ficha de claim cuyo payload trae `person.id`
- **WHEN** se renderiza el nombre del alumno
- **THEN** es un `<Link>` a `/academia/alumnos/[personId]`, no texto
  plano

#### Scenario: Ficha de cobro vuelve al origen

- **GIVEN** un claim abierto desde `/academia/cobros/reporte?from=…`
- **WHEN** el owner aprueba o rechaza el comprobante
- **THEN** la navegación resultante vuelve al reporte, no al listado
  de cobros
