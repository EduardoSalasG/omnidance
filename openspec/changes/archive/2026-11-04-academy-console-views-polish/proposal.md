# academy-console-views-polish

## Why

La consola del owner de academia acumula páginas con patrones
divergentes (headers con back, cards sin affordance, spinners sin
skeleton, zonas destructivas fuera del patrón, grids que no responden
entre mobile y desktop). Además tres rutas de Configuración no
matchean su título visible (`general`→"Clases", `pagos`→"Métodos de
pago") y la suscripción vive fuera de `/configuracion/*` pese a
estar en ese grupo del drawer.

## What Changes

- **Renombres de URL** (ya aplicados): `configuracion/general`→
  `configuracion/clases`, `configuracion/pagos`→
  `configuracion/metodos-de-pago` (con subrutas), y
  `/academia/suscripcion`→`/academia/configuracion/suscripcion`.
  Cada ruta vieja redirige; los links internos y el drawer apuntan a
  las nuevas. Suscripción queda sin `ConsoleHeader` como el resto de
  la sección.
- **Polish por sección**: videos, alumnos, planes, promos, cobros,
  preventas, equipo, configuración (6 páginas) y `/analitica`
  auditadas contra `.devin/skills/console-patterns` (las 6 reglas) y
  `ui-ux-principles` (jerarquía 3 niveles, agrupación, proximidad,
  affordance, touch targets, tabular-nums, container de página) en
  mobile (375px) y desktop.

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academy-console`: superficies de la consola alineadas al patrón
  unificado de consolas; URLs de la sección Configuración coherentes
  con sus títulos.

## Impact

- Web: páginas `academia/*` y componentes de sección listados en
  tasks.md; `BottomNav.tsx` (hrefs/keys); i18n `configPages.*`.
- Sin cambios de API ni de datos.
- Docs: `docs/qa-flows-inventory.md` (rutas renombradas).
