# Proposal — academy-home-console

## Why

El inicio del owner (`/inicio` → `AcademyDashboard`) es un vistazo de
situación general pero hoy tiene brechas: las clases del día no enlazan
a ningún lado, no hay señal de cobros pendientes de revisar, los KPIs
no tienen contexto temporal, las listas no tienen tope, falta `h1` y
jerarquía correcta, los hints de KPI solo viven en `title` (inaccesible
en táctil/teclado), y una academia recién creada ve una página casi
vacía sin guía de activación. El layout desktop deja la mitad del ancho
sin uso.

## What Changes

- **API** `GET /academies/:id/dashboard`:
  - `pendingClaims`: `{count, amount}` agregado de `PaymentClaim`
    PENDING + `items` (hasta 5, los más antiguos primero) con
    `{personId, personName, amount, createdAt}`.
  - `kpis` gana comparativas month-to-date del mes anterior (mismo
    tramo de días transcurridos): `billedMonthPrev`,
    `avgTicketMonthPrev`, `avgAttendancePerClassMonthPrev` (null sin
    base). Los KPIs sin histórico confiable (alumnos activos, planes
    comprables, clases/sem) no llevan delta.
  - `teamCount`: staff + instructores (insumo del checklist de
    activación).
- **Web** `AcademyDashboard` (inicio del owner):
  - Layout desktop de 2 columnas: izquierda "Hoy" (clases + cobros por
    revisar), derecha retención (vencen hoy / vencen esta semana /
    próximos cumpleaños). Mobile apila en ese orden.
  - "Clases de hoy": filas enlazan a `/academia/asistencia`; estado
    vacío "Hoy no hay clases" con link a horarios.
  - "Planes por vencer" se divide en "Planes que vencen hoy" y
    "Planes que vencen esta semana" (resto de la ventana ≤7d; lo que
    queda más allá se cuenta en un footer "Ver todos").
  - Renombrar "Cumpleaños próximos" → "Próximos cumpleaños".
  - Tope de 6 filas por lista + footer "Ver todos (N)" al módulo.
  - KPIs: delta vs mismo tramo del mes anterior bajo el valor donde hay
    base; `aria-label` compuesto label+valor+hint (el `title` queda
    como bonus visual); "—" se anuncia "sin datos".
  - Checklist de activación (visible mientras la academia no tiene
    alumnos): serie+horario, plan, primer alumno, equipo.
  - `h1` real en el home del owner (saludo) + fecha bajo el nombre de
    la academia.
- Fix de alineación vertical en filas de vencimientos (`items-center`
  en la grilla sm+).

## Impact

- Specs afectadas: `academies/owner-insights` (MODIFIED "Listas de
  insights" + ADDED cobros por revisar, checklist, KPIs comparativos).
- Contrato: `AcademyDashboard` gana campos aditivos (compat).
- Sin migraciones ni cambios de RBAC (dashboard ya va por
  `requireStaff`).
