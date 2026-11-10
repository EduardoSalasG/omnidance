# Tasks: producer-console-cta-dedup

## Web

- [x] 1.1 `academy-sales-section.tsx`: eliminar el `Button` `＋
  Invitar` del empty state (queda el `<p role="status">` solo; el
  CTA del header de sección permanece).
- [x] 1.2 `payment-methods-section.tsx`: eliminar el `Button`
  "Agregar método" del empty state (queda el mensaje solo; el CTA
  del header de la card permanece).

## Cierre

- [x] 2.1 `docs/qa-flows-inventory.md`: secciones de preventa por
  academias y medios de pago documentan empty state = mensaje solo.
- [x] 2.2 Verificación: `pnpm --filter @omnidance/web typecheck` OK,
  `openspec validate --changes` OK.
