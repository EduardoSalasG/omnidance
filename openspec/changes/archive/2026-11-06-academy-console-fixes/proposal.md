# Proposal: academy-console-fixes

## Why

La revisión UX de la consola Academy Owner
(`docs/academy-console-ux-review-2026-11-05.md`, "Bugs confirmados"
ítems 1-4 y "Copy técnica visible") levantó defectos concretos en la
consola de academia y el acceso al CRM:

- Un owner con tier PRO que también es PRODUCER ve el paywall del CRM
  con copy de productor: el actor CRM se resuelve al productor cuando
  la academia de la consola no está persistida en localStorage,
  aunque la lente activa sea ACADEMY_OWNER.
- "Personalizar niveles" falla con "name should not be empty": los
  POST del loop de copia salen sin `Content-Type: application/json`,
  el body no se parsea y el DTO valida `name` como vacío (el alta
  manual sí envía el header y funciona).
- El link "Volver" de páginas de edición y fichas abiertas desde otra
  ficha ignora el origen real (el patrón `?from=` ya existe en el
  roster de clase pero no se propagó).
- Copy técnica visible para el owner: `active=true`, hints de KPI que
  describen otra métrica, un disclaimer de conteo por tipo obsoleto y
  tipos de plan que no se entienden.
- `/academia/series` muestra "Algo salió mal" de forma intermitente:
  no hay guardia contra respuestas fuera de orden, una respuesta
  fallida más lenta puede pisar el éxito de una más nueva.

## What Changes

- **CRM** (`crm-context.tsx`): el actor por defecto respeta la lente
  activa (`useActiveRole`): ACADEMY_OWNER → su academia (la persistida
  en la consola si existe, si no la primera propia); PRODUCER → su
  productor. El `TierPaywall` ya parametriza copy por `actorType`: al
  resolverse el actor real el copy queda correcto sin cambios.
- **Niveles** (`configuracion/niveles/page.tsx` y `nuevo/page.tsx`):
  los POST del loop "personalizar" envían `Content-Type:
  application/json` (mismo header que ya usan el alta y la edición) y
  la card explicativa separa la segunda frase como línea propia.
- **Breadcrumbs** (`?from=`): editar plan y editar serie vuelven a la
  ficha de la entidad; el link de alumno desde la ficha del plan pasa
  `from` y la ficha de alumno lo honra; las clases listadas en la
  ficha del profesor pasan `from` y el roster de clase lo honra.
- **Copy**: hints de KPI de planes reescritos a lenguaje de usuario,
  disclaimer de "Niveles y cupos" corregido a la regla un nivel por
  tipo, labels y ayudas de tipos de plan clarificados; con tipo
  "Clase única" el input de clases se oculta y se envía `classCount=1`
  implícito.
- **Series** (`academia/series/page.tsx`): guardia de respuestas fuera
  de orden en el fetch del listado (solo el request más reciente
  aplica su resultado).

## Capabilities

- **Modified Capabilities**:
  - `crm/contact-console` (resolución del actor por lente activa).
  - `academies/class-levels` (personalizar copia la línea global).
  - `academies/console-lists` (navegación `?from=`, hints de KPI,
    form de plan, guardia de carrera en listado de series).

## Impact

- Web: `components/crm/crm-context.tsx`,
  `app/[locale]/(app)/academia/configuracion/niveles/page.tsx`,
  `configuracion/niveles/nuevo/page.tsx`,
  `app/[locale]/(app)/academia/planes/nueva/page.tsx`,
  `app/[locale]/(app)/academia/planes/[id]/page.tsx`,
  `app/[locale]/(app)/academia/alumnos/[personId]/page.tsx`,
  `app/[locale]/(app)/academia/series/nueva/page.tsx`,
  `app/[locale]/(app)/academia/series/page.tsx`,
  `app/[locale]/(app)/academia/clases/[id]/page.tsx`,
  `app/[locale]/(app)/academia/equipo/profesor/[id]/page.tsx`,
  `components/academy/plan-form.tsx`,
  `components/academy/academy-levels-card.tsx` (comentario).
- i18n: `messages/es-CL.json` y `src/i18n/parts/academyExtras.json`
  (es-CL + en/fr/pt-PT donde corresponda).
- Docs: `docs/qa-flows-inventory.md` secciones afectadas.
- Sin cambios de API ni de schema.
