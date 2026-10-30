# Change: unified-action-notice

## Why

La auditoría de feedback post-acción mapeó ~76 flujos: ~11 usan
`ActionNotice` (el estándar declarado en AGENTS.md), ~21 usan
done-screen verde + redirect timed, ~35 usan texto inline persistente
y ~20+ no dan feedback en éxito. El resultado: el mismo tipo de acción
se siente distinto según la superficie, y algunas acciones de alto
impacto (aprobar persona, anular doc, cancelar suscripción) no
confirman nada.

## What Changes

- `ActionNotice` gana un **host global** en `(app)/layout.tsx`: un
  aviso emitido antes de navegar (crear en `/nuevo` → listado) se
  muestra en el destino (sessionStorage + host compartido). El uso
  local por página sigue igual.
- Migración de TODOS los flujos al estándar:
  - Done-screen + redirect → `ActionNotice` global + navegación
    inmediata (sin timer de 900-1400ms que solo existía para que el
    usuario alcanzara a leer).
  - Inline persistente `{text,error}` → `ActionNotice` (shape
    compatible).
  - Silenciosos en éxito → `ActionNotice` (+ chequear `res.ok` donde
    hoy no se hace).
- Se mantienen: ConfirmSheet (es confirmación, no resultado), validación
  inline de formularios, toggles optimistas reversibles (icono/eswitch
  es el feedback), pantallas terminales de pago/encuesta, banner por
  query param de retorno de pasarela, scan en pista (regla ~5s).

## Impact

- `components/ui/action-notice.tsx` (host + emisor global).
- ~60 flujos en apps/web (dancer, academia, productor, admin, crm).
- i18n: los textos ya existen en su mayoría (migran tal cual); algunos
  flujos silenciosos necesitan key de éxito nueva ×4.
