# Handoff - 2026-10-20a (consola productor v2 + paginación analítica + seed)

## Completado en esta sesión (commits en dev)

| Commit | Slice |
|---|---|
| `8ea42c5` | Consola instructor + ventana asistencia [-30,+30]min + recordatorios 30/10min |
| `918929e` | Seed: log de progreso por sección |
| `2b4f2da` | **Fix prod**: SERVER_API_URL (server fetch caía a localhost en Netlify) + home productor tipo dashboard |
| `125e870` | **Este batch**: consola productor v2 + paginación `/query/run` + seed eventos |
| `07ff990` | release 0.7.0: versiona + changelog |

### Consola productor v2 (este batch)

- **Configuración dividida** en páginas (patrón `/academia/configuracion/*`):
  `/productor/parametros` = Valores por defecto (mesas + aforo sentable +
  corte preventa); `/productor/medios-pago` (pasarela + métodos propios);
  `/productor/suscripcion` (Producer Pro + comisión read-only +
  `ProReturnNotice` - el retorno Flow `?pro=ok` del webhook
  `platform-customer-return` ahora apunta acá); `/productor/apariencia`
  (ThemeToggle). `PRO_SECTION_HREF` → `/productor/suscripcion`.
- **Nav**: Configuración lista Defaults/Medios de pago/Suscripción/Mis
  pagos/Apariencia; sin "Listas de invitados".
- **Listas dentro de la ficha**: `EventListsSection` en
  `/productor/eventos/[id]`; `/productor/listas` → redirect a eventos;
  `nueva?eventId=` preseleccionado + back a la ficha; `listas/[id]` back
  al evento dueño.
- **Reservas de mesa**: REQUESTED→confirmar/cancelar, CONFIRMED→guardar
  cambios (mesa+tamaño)/cancelar.
- **Comprobantes**: cola masiva PENDING primero + historial resuelto +
  FilterBar + Pager + empty state (ya no hay página en blanco).
- **Dashboard**: tops en `lg:grid-cols-2` (facturación izq, asistencia
  der), cobros por revisar como sección propia.
- **Notificación `ticket.sale`** al productor al liquidar orden PAID
  (skip si comprador = productor); spec cubierto.
- Botones "Nuevo evento"/"Nuevo código" = `primary` (acento morado).

### Paginación `/query/run`

- DTO: `page`/`pageSize` (int ≥1, size ≤100). Servicio clampa y pasa
  `skip`/`take` a handlers (`ExecOpts` + `capped(rows, take, skip)`).
- `QueryRunResult` gana `page`/`pageSize`; `/analitica` renderiza `Pager`,
  filtros/entidad resetean a pág 1, retry mantiene página.
- Delta del change `analytics-query-engine` actualizado (sigue abierto -
  falta su task 6.3 QA manual + handoff).

### Seed

- Muvet productor: edición pasada CLOSED (Desafío de Tronos), ventas del
  mes, lista de invitados, 3 claims PENDING (transferencia/MP).
- **Todos** los eventos PUBLISHED/LIVE/CLOSED: 150-350 entradas
  determinísticas por hash del id (vie/sáb 250-350), pagos PAID, ~85%
  check-ins en pasados; mesas reservables en 3 eventos con mezcla
  REQUESTED/CONFIRMED/CANCELLED.
- Corrido en local: seed 39s (idempotente), eventos verificados con
  counts reales (Desafío próximo: 275 tk + 6 mesas; edición anterior:
  272 tk + 230 check-ins).

## Verificación citada

- `tsc --noEmit` web + api: limpio.
- `payment-settlement` 23/23 + `query.service` 13/13.
- `i18n-audit`: `ALL_KEYS_OK`. `impeccable detect`: `[]`.
- `openspec validate --changes`: 2 passed. `producer-console-v2`
  archivado → specs canónicas actualizadas.

## Release v0.7.0 — estado

- Tag `v0.7.0` en `main` (`07ff990`), push main + dev sincronizados.
- Deploy API (GH Actions → VM): **success** en 5m49s —
  `/api/health` 200, `/api/events` 200 con data.
- **Web (Netlify): rebuild disparado por el push pero aún sirve el
  build anterior** (chunks de páginas nuevas 404 en CDN al cierre).
  El fix SSR entra en producción cuando ese build termine - verificar
  `/productor/apariencia` renderiza tras login.

## Release v0.8.0 — onboarding tours (commit `ff49f37`, tag `v0.8.0`)

- **Audit**: dancer (`profile-setup` + `home`/`home-academy` + tours por
  módulo) y owner (`academia-owner` + `academia`) ya estaban completos.
- **Productor**: tour `productor` montado en la rama PRODUCER de HomeHub
  — `producer-kpis` → `producer-claims` → `producer-tops` → `nav-events`
  → menú (`appbar-menu` móvil / `app-sidebar` desktop) → `appbar-bell`.
  Copy `tours.productor` reescrito al vocabulario v2 (el anterior
  mencionaba liquidaciones/listas de puerta, módulos eliminados).
- **Instructor**: tour `instructor` — `home-stats` → `home-classes`
  (anchor nuevo en "Próximas clases") → `nav-classes` → `nav-students`
  → `appbar-bell` → `nav-profile`.
- Anchors nuevos en `ProducerDashboard` (kpis/claims/tops) y
  `SIDEBAR_TOUR["/productor/eventos"]="nav-events"` en BottomNav.
- Persistencia: mismo contrato — `POST /me/onboarding {tour}` mergea en
  `Person.onboarding` JSON; los tours corren una sola vez por usuario.
- OpenSpec `2026-10-10-console-onboarding-tours` archivado → specs
  `events/producer-console` y `academies/staff-roles` actualizadas.
- **Deploy**: API workflow success 5m45s; `/api/health` y `/api/events`
  200 en prod. Web: rebuild de Netlify disparado por el push — verificar
  en Deploys que sirva el build de `ff49f37` (los tours son front-only).

## Pendiente

- QA manual del productor (320/768/1024) + handoff 6.3 de
  analytics-query-engine.
- Seed de prod (`SEED_ENV=dev pnpm db:seed` contra la URL directa) sigue
  pendiente en cancha del usuario.
- Verificar rebuild de Netlify v0.8.0 (los tours `productor`/`instructor`
  corren en la primera visita a `/inicio` de usuarios sin la key en
  `Person.onboarding`).

## Gaps conocidos

- `/productor/parametros` y `/productor/pagos` mantienen gate inline
  (duplican `ProducerGate`) - mismo comportamiento, refactor cosmético
  pendiente.
- `producer.modules.params`/`paramsDesc` quedaron sin referencia en el
  front (el hub murió) - candidatos a limpieza.
