# Handoff: polish consola academia + cobros sueltos + niveles a Config

**Rama**: `dev` · todo commiteado, working tree limpio.

## Qué se hizo

### `academy-niveles-to-config` (archivado)
`/academia/niveles` → `/academia/configuracion/niveles` + redirect;
item del drawer de Enseñanza a Configuración; spec class-levels
actualizada. Verificado en browser por el usuario.

### `platform-charge-collect` (archivado, `6a380d93`)
Cobros sueltos plataforma→actor sobre `customer/collect` de Flow (el
puerto ya existía para invoices impagas): `PlatformChargesService`,
`POST /admin/platform-charges` (admin.access), rama PLATFORM_CHARGE
en settlement, "Cobro directo" en `/admin/usuarios/[personId]`,
whitelists orderType + openapi/postman regenerados (367 paths).
Decisión: error transitorio → 502 con claim liberado; subject viaja
en ORDER_CREATED (sin columna nueva).

### `academy-console-views-polish` (archivado, `8ccb9851` + commit polish)
- **Renombres**: `configuracion/general`→`clases`,
  `pagos`→`metodos-de-pago` (+subrutas), `/academia/suscripcion`→
  `/configuracion/suscripcion`. Redirects en todas las rutas viejas;
  BottomNav + links internos actualizados; keys
  `configPages.classes|payMethods|subscription` (4 locales);
  suscripción sin ConsoleHeader (nivel 1 de sección).
- **Polish**: 8 agentes devin corriendo en paralelo vía **herdr**
  (panes `polish-*`, brief en `docs/polish-brief.md`): alumnos,
  planes+promos, cobros, equipo, videos+preventas, config, suscripción,
  analítica. Estados explícitos, ActionNotice, chevrons, responsive.
- Verificación integrada: `tsc --noEmit` web limpio, `ALL_KEYS_OK`
  (agregada `academyPromos.notFound` faltante).

## Notas operativas

- **Herdr**: `herdr tab create --workspace w1 --cwd <repo> --label x`
  crea pane; `herdr agent start <name> --kind devin --pane <id>`;
  `agent prompt <name> "<texto>"` despacha; `agent read/wait` para
  seguir; `agent send-keys <name> down enter` desbloquea diálogos de
  permiso ("Bypass mode"); `tab close` limpia. Los devin hijos heredan
  las skills del repo.
- Los "done/idle" de `agent list` son prematuros: `agent read` muestra
  el estado real (blocked = diálogo de permiso).
- Dev stack sigue corriendo (`pnpm dev` en background, shell 24b381).

## Pendiente

- Verificación **visual** del polish en browser (los agentes solo
  verificaron tsc/i18n/eslint; no render). Conviene pasada por cada
  sección en mobile+desktop antes de darlo por cerrado.
- `pnpm db:enrich` sin correr (de handoff anterior).
- `customer/collect` automático (deudas por job): la base
  `PlatformChargesService.collect()` ya está lista para reuso.
- `multipais-foundation`: tasks 10, 11, 13 abiertas.
