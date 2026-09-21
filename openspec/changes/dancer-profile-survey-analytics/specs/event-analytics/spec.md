# event-analytics

## Purpose

Analítica por evento para el productor (asistentes, composición del público, resultados de la encuesta) y analítica como módulo propio de navegación, separado de administración.

## ADDED Requirements

### Requirement: Analítica por evento

`GET /api/events/:id/analytics` SHALL responder, solo al producer owner del evento o admin: `attendees` (check-ins no anulados), `gender` (`{M,F,OTHER,unknown}`), `danceRoles` (`{LEADER,FOLLOWER,SWITCH,unknown}` — rol del asistente en los estilos del género del evento; sin declaración → `unknown`) y `ratings` (`count` + promedios por dimensión, respetando k-anonymity ≥3: menos de 3 evaluaciones → sin promedios). Otros roles MUST recibir 403.

#### Scenario: Productor ve métricas de su evento

- WHEN el productor owner consulta la analítica de su evento con asistentes y ≥3 evaluaciones
- THEN recibe asistentes, proporciones de género y rol, y promedios de la encuesta

#### Scenario: K-anonymity

- WHEN el evento tiene menos de 3 evaluaciones
- THEN `ratings` muestra el count pero no promedios

#### Scenario: No-owner no accede

- WHEN un usuario sin relación al evento consulta `/api/events/:id/analytics`
- THEN recibe 403

### Requirement: Sección de analítica en el evento del productor

`/productor/eventos/[id]` SHALL mostrar tarjetas con asistentes, barras de proporción género y leader/follower, y los puntajes de la encuesta (estrellas) cuando haya datos.

#### Scenario: Analítica visible en la consola

- WHEN el productor abre el detalle de su evento
- THEN ve la sección Analítica con las métricas disponibles (o estado vacío honesto)

### Requirement: Analítica como módulo de sidebar

La navegación SHALL exponer "Analítica" como módulo propio para roles con lente de gestión (producer: sus eventos → analítica por evento; admin: el resumen por rol/lens existente). Analítica MUST NOT seguir bajo el grupo de administración en el sidebar.

#### Scenario: Admin entra a analítica por módulo propio

- WHEN un admin abre el sidebar
- THEN "Analítica" aparece como destino separado de "Administración", y la vista por rol vive ahí
