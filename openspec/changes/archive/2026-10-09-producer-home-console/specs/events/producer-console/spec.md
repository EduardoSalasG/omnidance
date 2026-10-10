# events/producer-console Delta

## ADDED Requirements

### Requirement: Home del productor como dashboard

El home (`/inicio`) de la lente PRODUCER SHALL ser un dashboard
operativo al estilo del dueño de academia - no un hero con CTA. La API
SHALL exponer `GET /producer/dashboard` (SessionGuard; productor
APPROVED o permiso `admin.access`) que agrega en un solo request:

- `kpis`: `upcoming` (eventos PUBLISHED/LIVE con `endsAt` a futuro),
  `sold` (tickets ACTIVE|USED de esos eventos), `grossMonth` (bruto
  PAID TICKET del mes calendario) y `pendingClaims` (comprobantes
  PENDING).
- `topRevenue` y `topAttendance`: top 5 eventos del productor por
  bruto PAID y por check-ins no anulados, con id/nombre/fecha.
- `pendingClaims`: `{count, amount, items≤5}` de la cola de
  comprobantes manuales (persona, método, monto, fecha).

El front SHALL renderizar KPI cards + las tres listas con el mismo
lenguaje visual del dashboard de academia (filas clickeables que
navegan a la ficha o a la cola), estados skeleton/error/empty y sin
hero ni sección "Próximos eventos".

#### Scenario: productor con actividad

- WHEN un productor con eventos, ventas y comprobantes pendientes abre
  /inicio en su lente
- THEN ve los 4 KPIs, los top 5 por facturación y por asistencia, y la
  cola de cobros por revisar con monto acumulado

#### Scenario: productor sin eventos

- WHEN un productor aprobado sin eventos abre /inicio
- THEN el dashboard muestra KPIs en cero y un CTA a crear su primer
  evento; las listas vacías no se renderizan

#### Scenario: navegación desde una fila

- WHEN el productor toca un evento de un top o un comprobante de la
  cola
- THEN navega a `/productor/eventos/:id` o `/productor/comprobantes`

### Requirement: Navegación del productor simplificada

El chrome del productor SHALL listar en su sidebar (desktop) y drawer
(móvil) solo: Inicio, Eventos (su módulo), Códigos, Listas,
Comprobantes, CRM y Analítica; seguidos de un grupo "Configuración"
(con "Comisión y defaults" y "Mis pagos") inmediatamente encima de la
sección Cuenta. El tab "Crear evento" y el hub `/productor` se
eliminan de la navegación; la ruta `/productor` SHALL redirigir a
`/inicio`. Los `backHref` de los módulos del productor apuntan a
`/inicio`.

#### Scenario: sidebar del productor

- WHEN un productor abre la sidebar o el drawer
- THEN no ve "Crear evento" ni el hub "Productor"; "Comisión y
  defaults" y "Mis pagos" aparecen bajo el grupo "Configuración" sobre
  la sección Cuenta; el enlace a la cartelera pública no aparece

#### Scenario: retorno de registro Pro

- WHEN Flow redirige tras el registro de tarjeta para Producer Pro
- THEN el API devuelve 303 a `/productor/parametros?pro=ok` y esa
  página muestra el aviso de retorno
