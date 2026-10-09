# academy-console-v3 — reestructura de la consola del owner

## Why

La consola del dueño de academia creció con páginas planas y duplicadas:
horarios y asistencia standalone no aportan (los horarios son de la serie
y el owner no marca presente — eso lo hace el instructor desde su clase),
los listados no navegan a detalle, cobros mezcla tres conceptos, equipo
tiene dos altas separadas, analítica duplica chips de rol, y falta
paginación. Además se introduce la encuesta mensual de curso/profesor.

## What

- **Fixes UI**: filas de vencimientos ya no colapsan en mobile (faltaba
  `flex-1`); token semántico `warn` (amber-700 claro / amber-300 oscuro)
  reemplaza los literales `amber-*` en la consola.
- **Nav**: sidebar owner — Inicio solo primero; Planes pasa a
  Administración; se quita Analítica duplicada; se eliminan Asistencia y
  Horarios (pages borradas). Series se renombra "Clases"; "Nueva clase".
  Back con nombre de página anterior solo en subpáginas nivel ≥2.
- **Clases** (`/academia/series` → "Clases"): cards sin acciones — el
  tap abre el detalle de la clase/serie (editar, desactivar, reactivar,
  **eliminar lógico** = desactivada y oculta salvo analítica, slots,
  próximas clases + reservas, historial con asistencia + profesor).
  Filtros por modalidad y nivel; default solo activas. "Importar clases"
  (CSV) vive acá junto a los filtros.
- **Detalle de clase** (instancia): el instructor marca presente solo a
  alumnos con reserva activa (POST /classes/:id/attendance); el owner
  ya no puede registrar asistencia.
- **Planes**: KPIs propios (activos + top 3 por alumnos con delta),
  orden nombre/precio asc/desc, card → detalle con alumnos vigentes.
- **Cobros**: card → detalle del pago (comprobante, aprobar/rechazar);
  historial unificado; medios de pago a Configuración; KPIs facturación/
  ticket/top-3 métodos con delta.
- **Equipo**: alta única con tipo (profesor/colaborador) → datos comunes
  primero, permisos o acuerdo económico al final. Detalle de miembro:
  profe (clases impartidas, cobrado, encuestas) y colaborador (permisos
  + editar). El acuerdo económico del profe (mensual por N clases o por
  clase) se define acá, no en clases particulares.
- **Clases particulares**: sin comisión/filtros — solo solicitudes y
  confirmar fecha/hora.
- **Analítica**: una sola página "Analítica" = consultas (KPI cards,
  gráficos, tablas); sin chips Dashboard/Consulta ni selector de rol.
- **Perfil owner**: sin semanas seguidas, mis pagos ni "tus academias";
  Apariencia pasa a Configuración (owner y productor).
- **Configuración**: cada sección es una página hija en el sidebar.
- **Alumno**: detalle muestra el score asignado.
- **Encuestas de curso**: mensual, alumnos evalúan curso + profesor +
  observaciones; resultados solo para el owner (detalle de clase por
  mes; detalle de profe por mes y serie).
- **Paginación**: contrato paginado en todos los endpoints de listado
  y controles en las vistas.

## Out of scope

- Cambios en nightlife/productor fuera de lo listado.
- Exportaciones nuevas de analítica.
