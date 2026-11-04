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

### Requirement: Listas acotadas con preview expandible en fichas

Toda lista dentro de una ficha de consola que pueda crecer sin cota
(historiales, pagos, reservas, alumnos de un plan, códigos emitidos,
resultados de encuestas, entidades relacionadas) SHALL renderizar un
preview acotado (`LIST_PREVIEW` = 5 ítems por defecto) seguido de un
control "Ver todo" que expande el listado completo dentro de la misma
ficha, siguiendo el patrón canónico de `series/[id]` (slice del array
ya fetcheado + `<li>` final con `<button>` full-width `min-h-11
text-neon` que alterna `common.seeAll (N)` / `common.showLess`). El
control compartido vive en `components/ui`. Las listas ya acotadas
server-side a ≤ el preview quedan como están. MUST NOT existir
expands que solo dupliquen lo que la ficha ya muestra, ni drill-down
inline que debiera ser `<Link>` a ficha.

#### Scenario: historial largo con preview

- **GIVEN** un alumno con 30 filas de historial
- **WHEN** el owner abre su ficha
- **THEN** ve 5 filas y un botón "Ver todo (30)"; al presionarlo se
  muestran las 30 y el botón pasa a "Ver menos"

#### Scenario: lista corta sin control

- **GIVEN** un plan con 3 alumnos vigentes
- **WHEN** se abre la ficha del plan
- **THEN** no aparece el botón "Ver todo" (la lista ya cabe en el
  preview)

### Requirement: Estado sin acceso distinto del error en fichas

Un deep link a una ficha de consola que el backend rechaza con
401/403/404 SHALL mostrar el estado "sin acceso" (mensaje + salida
vía `ConsoleHeader` o CTA), MUST NOT colapsar en el error genérico
con retry. Los errores transitorios (5xx, red) conservan
`role="alert"` + retry. Los componentes auxiliares que degradan por
cap/tier MUST NOT mostrar un empty-state que afirme un hecho falso
("Sin colaboradores" cuando el backend respondió 403).

#### Scenario: claim sin permiso

- **WHEN** una persona sin el cap requerido abre
  `/academia/cobros/claim/[id]` y el backend responde 403
- **THEN** ve el estado "sin acceso", no "error al cargar" con retry

#### Scenario: sección sin cap de lectura

- **WHEN** `GET /academies/:id/staff` responde 403 por cap
- **THEN** la sección muestra el estado sin-acceso o se omite, nunca
  "Sin colaboradores"

#### Scenario: fallo de red en ficha

- **WHEN** el fetch de la ficha falla por red o 5xx
- **THEN** mantiene `role="alert"` + botón retry

### Requirement: Errores de fetch visibles en colas operativas

Las colas operativas de la consola (claims, order-claims, historial de
cobros) MUST NOT tragar fallos de fetch ni renderizar vacío ante un
error: un fallo SHALL mostrar `role="alert"` + retry como cualquier
otra superficie, porque una cola vacía se lee como "nada que
validar". Los bloques auxiliares que documentan silencio deliberado
(KPIs secundarios) conservan su excepción solo si no son la superficie
primaria de trabajo.

#### Scenario: API caída en la cola de claims

- **GIVEN** la API respondiendo 5xx
- **WHEN** el owner abre `/academia/cobros`
- **THEN** la cola muestra error con retry, no "Sin pagos por
  validar"

### Requirement: Mantenedor de niveles al patrón de consola

El mantenedor de `/academia/configuracion/niveles` SHALL seguir el
flujo crear→detalle→editar: el alta sale del listado a página
dedicada (`/nuevo`), la edición vive en página propia, y el delete se
ejecuta desde la zona roja con `ConfirmSheet` — nunca `×` por fila
sin confirmación ni rename inline `onBlur` en las cards.

#### Scenario: delete de nivel con confirmación

- **WHEN** el owner elimina un nivel desde su página de edición
- **THEN** un `ConfirmSheet` pide confirmación antes del DELETE

#### Scenario: listado de niveles solo navega

- **WHEN** el owner ve el listado de niveles
- **THEN** las filas navegan a la página de edición y no contienen
  inputs ni controles destructivos inline
