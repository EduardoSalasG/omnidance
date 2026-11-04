# academy-niveles-to-config

## Why

El mantenedor de la línea de niveles de la academia vive en el grupo
"Enseñanza" del drawer (`/academia/niveles`, junto a series,
particulares y videos). Semánticamente no es un módulo operativo: es
una configuración de una vez (definir o heredar la línea, tocarla
cuando cambia la malla) al mismo nivel que los valores por defecto de
clases, los métodos de pago o el perfil público. Su ubicación actual
lo confunde con trabajo diario.

## What Changes

- **Web**: la página se mueve a `/academia/configuracion/niveles` y el
  item del drawer pasa del grupo "Enseñanza" al grupo "Configuración"
  (después de "Clases"/general, antes de "Métodos de pago"), conservando
  el `academyFeature: "classes"` y el icono `layers`.
- **Redirect**: `/academia/niveles` redirige a
  `/academia/configuracion/niveles` (deep-links viejos no mueren) y los
  links internos se actualizan a la ruta nueva.
- La página queda alineada al patrón del resto de sub-páginas de
  Configuración: nivel 1 del drawer, sin `ConsoleHeader` (ninguna
  página de la sección lo usa).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `academies/class-levels`: la superficie del mantenedor cambia de
  ubicación en la consola (de módulo de Enseñanza a sub-página de
  Configuración). Comportamiento del mantenedor sin cambios.

## Impact

- Web: `apps/web/src/app/[locale]/(app)/academia/niveles/page.tsx`
  (movida + redirect), `academia/configuracion/niveles/page.tsx`
  (nueva), `components/layout/BottomNav.tsx` (grupo del item),
  `apps/web/src/i18n/parts/academyExtras.json` (`configPages.levels`).
- Docs: `docs/qa-flows-inventory.md` (ruta del flujo).
- Sin cambios de API ni de datos.
