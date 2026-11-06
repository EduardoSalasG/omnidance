# Triage UX consola Academy Owner (review manual 2026-11-05)

Feedback del usuario tras recorrer la consola por tier (tumbao COBROS,
muvet STUDIO, gabriel PRO, academias multi-tier). Cada ítem lleva tipo
(bug / copy / ux / pregunta / decisión / idea) y respuesta verificada
en código cuando aplica. Reglas transversales al final.

## Respuestas a preguntas del usuario

- **Chips del card de alumno** (`students-section.tsx`): chip 1 =
  estado de la inscripción (Activo/Online/Prueba/Pausado/Congelado).
  Chip 2 = **nombre del plan** ("Normal", "Clase suelta") coloreado por
  estado de pago: verde = al día (`endsAt >= hoy`), rojo = vigencia
  vencida, outline = sin vigencia registrada. La fecha al lado es
  "pagado hasta" (`endsAt`) + fecha de inicio. O sea: "Dueño
  MuéveteOnTour · Clase suelta rojo" = su plan Clase suelta quedó
  vencido en esa fecha (no es fecha de pago). Mejora propuesta: ícono
  de billete/reloj + label "Venció el X" en vez de color solo.
- **Orden del listado de alumnos**: `createdAt desc` (más reciente
  primero). PAGE_SIZE actual = 24 fijo.
- **`/alumnos/nuevo` personId**: hoy es texto crudo del id. Propuesta
  aceptada: buscador de persona con debounce (nombre, apellido, email).
  Flujo si la persona no existe: definir (probable: crear Person mínima
  o invitar por magic link; el POST /enrollments exige personId
  existente, verificar en implementación).
- **Suscripciones por validar vs pagos por validar** en cobros: hoy
  son dos colas distintas (comprobantes de suscripciones por
  transferencia vs pagos). Tu criterio es correcto: transferencia que
  requiere validación es una renovación de inscripción, no una
  "suscripción" real (esa solo existe con tarjeta). Propuesta:
  renombrar a "Renovaciones por validar" o unificar en una sola cola.
- **Reagenda de particulares**: verificar flujo exacto en
  implementación (si el owner reagenda, ¿el alumno confirma?). Idea
  futura del usuario: disponibilidad horaria del instructor → backlog.
- **Selector solo para PRO?**: no exactamente. Cambiar de academia es
  necesario con >1 membresía en cualquier tier (academias@ tiene 3
  COBROS). Lo que SÍ es PRO (`multiAcademy`) es la opción "+ Nueva
  academia" dentro del selector. Tu sugerencia de moverlo al sidebar
  encima de Inicio: evaluable, es coherente con el chrome del owner.

## Bugs confirmados (Slice A)

1. **CRM en paywall para gabriel PRO** (`/crm/*`): hipótesis casi
   segura - gabriel también es PRODUCER y el actor resuelto es el
   productor (sin Pro), de ahí el copy "Analítica de eventos y
   asistentes" (es copy de productor, no de academia). Verificar orden
   del actor picker: si la lente es academia, el actor por defecto
   debe ser su academia PRO, no su productor. Paywall copy correcto
   por actorType.
2. **"Personalizar niveles"** (`/configuracion/niveles`): toast
   "name should not be empty". Front hace un POST por nivel global con
   `{name, order}` - verificar si algún nivel global del seed tiene
   name vacío/null o si el body pierde el campo.
3. **`/academia/series` "Algo salió mal" intermitente**: cargó al F5.
   Probable race en fetch o dato nulo. Reproducir y loggear.
4. **Breadcrumbs rotos (5 casos)**: volver de editar plan → va a
   planes (debe ir a ficha del plan); alumno desde plan → alumnos
   (debe volver a la ficha del plan); editar serie → lista (debe ir a
   ficha serie); claim desde reporte → cobros (debe ir a
   cobros/reporte); clase desde profesor → serie (debe volver a
   ficha profesor). Patrón: `?from=` ya existe en el roster de clase;
   propagar al resto.
5. **`credit_card` crudo** en historial: normalizar a etiqueta i18n.
6. **"Ver todos" de "planes que vencen esta semana"** navega a
   alumnos; debe expandir la lista in-place (SeeAllRow ya existe).
7. **Copy técnica visible**: "Planes de membresía con active=true" →
   texto de usuario; leyenda de KPIs de planes "Planes con más
   alumnos activos este mes" es incorrecta/confusa (muestran alumnos
   activos por plan, no ranking). "Cobros por revisar" (inicio) vs
   "cobros por validar" (cobros): unificar a una sola forma.
8. **"Niveles y cupos" leyenda**: "111 alumnos en total - puede
   contar en más de un tipo" ya no aplica (un nivel por tipo desde
   2026-11): corregir el hint.
9. **`/cobros/reporte`**: títulos KPI cortados → solo "Facturado" y
   "Alumnos"; filas con nombre ilegible → card de 4 líneas (nombre,
   plan, método, fecha + monto/estado); agregar KPI por método de
   pago agrupados en sección "Métodos de pago".

## Inicio owner (Slice B)

- Quitar el toggle Simplificado/Extendido → siempre Extendido (modo
  simple muere; limpiar `homeMode`, i18n y localStorage asociado).
- Desktop: subir sección facturación a la misma fila que alumnos
  activos (llenar la fila); mobile igual.
- Truncate de títulos en cards "cobros por revisar" y "planes que
  vencen esta semana" (mobile y desktop): revisar clamp/elipsis.
- Selector de academia: evaluar moverlo al sidebar encima de Inicio
  (solo visible con >1 membresía o si puede crear). Confirmar diseño.

## Alumnos (Slice C)

- `/alumnos/nuevo`: personId → buscador con debounce (nombre, apellido,
  email); definir flujo para persona inexistente (verificar si el API
  permite crear Person o requiere que se registre).
- "Pagado hasta" del alta: calcular desde el plan elegido (un input
  menos), editable si se quiere override.
- Ficha alumno: agregar teléfono + email; método de pago en pagos;
  "pagado hasta" baja a tercera fila en mobile.
- Editor de inscripción (estado/pagado hasta): no editable por
  defecto → botón/ícono "Editar" que habilite campos + confirmar.
  Alternativa aceptada por diseño: edición tras gesto explícito.
- Paginación: 10 en mobile (regla nueva, ver Reglas).
- Refinar card tras decidir chips (ver respuestas).

## Cobros + métodos de pago + suscripción (Slice D)

- **Reporte propio**: `/academia/cobros/reporte` entra al sidebar
  debajo de Cobros como "Reporte". Cobros queda: KPIs + planes que
  vencen + pagos por validar. Historial se quita de cobros (lo cubre
  reporte). Los dos filtros raros se revisan en ese rediseño.
- Métodos de pago: quitar el campo orden del form (orden de llegada);
  botón "Agregar" verde y a la derecha del título; unificar
  terminología "método de pago" (hoy aparece "medio" y "metodo" en
  título/URL/checkout).
- Suscripción: historial de cobros clickeable → detalle (plan,
  método, referencia, nº operación, estado); separación entre
  "Ciclo de facturación" y las cards de planes.
- Config niveles: mejorar indentación de la segunda línea.

## Series / clases / particulares / equipo (Slice E)

- `series/nueva`: fila Día + Inicio + Término juntos (o día arriba y
  los dos tiempos abajo); espacio entre "Tipos de clase" y sus
  checkboxes y entre "Horarios semanales" y sus opciones.
- Ficha de clase: el header/horario no debe ser clickeable hacia la
  edición del slot (solo desde la ficha de la serie).
- Paginación 20/10 en roster de clase, particulares, próximas clases
  del profesor (regla).
- Particulares: orden default más reciente → antigua; parpadeo al
  cambiar filtros (probablemente re-render completo: estabilizar);
  botón cancelar arriba a la derecha junto al precio; optimizar card
  desktop/mobile.
- Equipo/profesor: paginación y nombres legibles en mobile; volver de
  clase → ficha profesor (ya está en Slice A breadcrumbs).
- Calendario del inicio: 2+ clases por celda se ve mal → card de
  clase responsive; en mobile mostrar hora inicio Y término por
  clase. Validar legibilidad con playwright.
- Series: select de estilos solo con estilos presentes en las series
  de la academia; limpiar estilos de test del seed; eliminar "cubano"
  y "rueda de casino" del catálogo (dev y prod). OJO: "cubano" es
  estilo real de la escena - confirmar con el usuario si es baja del
  catálogo global o solo de esos seeds.
- Form plan: tipos "pack de clases" / "por período" / "prueba" -
  revisar labels/ayuda (los dos primeros confunden); "clase única"
  debe ocultar "clases por período" (fijar 1 implícito).

## Videos + CRM (Slice F)

- Feature flag `academy_videos` (admin-toggle): OFF esconde el ítem
  del sidebar del owner y bloquea las páginas `/academia/videos*`
  (además del tier PRO). Idea del usuario: videos podría ser add-on
  cobrado a alumnos - anotado para revisión de producto.
- Form de video: "id de clase" → selects serie → horario → clase.
  Modelo futuro: categoría del video (clase / taller / coreografía /
  material) con asociación opcional - reestructura de datos, queda
  como decisión de diseño a madurar (anotado).

## Ideas de producto (backlog, no implementar ahora)

- Disponibilidad horaria del instructor para particulares (el alumno
  elige hora libre al comprar).
- Medición en Explorar: vistas a perfil de academia, detalle de
  clase, compras de plan/clase desde explorar → estadísticas para
  vender destacación (línea revenue tipo ads). Requiere tracking de
  eventos nuevo.

## Reglas transversales nuevas (registrar)

- **Paginación de listas pesadas: 20 desktop / 10 mobile** en todas
  las superficies de consola (alumnos, historial cobros, reporte,
  roster, particulares, próximas clases, etc.). Actualizar
  `console-patterns` y `ui-lists` skills.
- **Sin tecnicismos en copy de usuario**: nada de `active=true`,
  nombres crudos de enum (`credit_card`), ni flags internas; solo el
  admin ve vocabulario técnico.
- **Terminología**: "método de pago" (no "medio"/"metodo") en toda la
  superficie y checkout.
- **Feedback por tier corregido aplica a todos los tiers** (regla del
  usuario: un bug levantado en COBROS no se vuelve a reportar en
  STUDIO/PRO).
