# survey-cards-dancer-lens

## Why

El `HomeHub` renderiza las cards de encuestas pendientes (post-social
"¿Cómo estuvo X?" y encuesta mensual de curso) para **cualquier rol**
encima del contenido de su lente: un owner de academia ve en el inicio
de su consola la encuesta del social al que fue a bailar. La regla de
producto es que esas encuestas le hablan al bailarín: deben aparecer
solo en el inicio del DANCER, cada una en el apartado que le
corresponde (social en Social, curso en Academia).

## What Changes

- **Web**: la sección de encuestas pendientes del `HomeHub` se monta
  solo con `activeRole === "DANCER"`; las cards post-social solo en
  `viewMode === "social"` y las de curso solo en
  `viewMode === "academy"`. Owner, productor, instructor y admin
  dejan de verlas en su consola (las notificaciones in-app/push del
  evento y del job mensual no cambian: son el canal de aviso, no la
  card).

## Capabilities

### New Capabilities

(ninguna)

### Modified Capabilities

- `post-event-survey`: la card "¿Cómo estuvo [evento]?" se muestra en
  el apartado Social del inicio del bailarín, no en cualquier home.
- `academies/course-surveys`: la card de encuesta mensual se muestra
  en el apartado Academia del inicio del bailarín.

## Impact

- Web: `apps/web/src/components/home/HomeHub.tsx` (única superficie
  afectada; los endpoints `/me/pending-*` ya existen y no cambian).
- Docs: `docs/qa-flows-inventory.md` (flujo de encuestas por lente).
