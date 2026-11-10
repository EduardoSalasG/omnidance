# Proposal: consola admin alineada al patrón CRUD compartido

## Resumen

Auditoría de la consola admin/soporte con los patrones de
`academy-console-cta-gating`/`producer-console-cta-dedup`. Resultado:

1. `/admin/campanas` mantiene el form de crear/editar inline dentro
   del listado (`setShowForm`) - viola "crear = CTA → página
   dedicada" de `console-crud-flows`, la regla que ya cumplen el
   resto de las consolas.
2. `/admin/catalogos`: una sección sin valores renderiza una Card
   vacía sin mensaje.
3. `/admin/facturacion/promos`: el CTA de crear es un `<Link>` con un
   `<Button>` adentro (interactivo anidado, prohibido por
   console-patterns §2).

Soporte (`/soporte`) es read-only y no presenta desviaciones. Admin
no gatea por tier ni tiene selector de actor: los dos patrones
restantes del audit no aplican.

## Alcance

- `campaign-form.tsx` nuevo en `components/admin/`: el `CampaignForm`
  sale del listado sin cambios funcionales (audiencias, conteo en
  vivo, preview iframe, schedule).
- `/admin/campanas/nueva/page.tsx`: crear (y editar vía
  `?edit=<id>` precargando con `GET /admin/mail-campaigns/:id`), con
  `ConsoleHeader` de vuelta al listado.
- `/admin/campanas/page.tsx`: sin form inline; "Nueva campaña" y
  "Editar" por card navegan a la página dedicada; run/test/cancel
  quedan en las cards (acciones de operación, no de edición).
- `/admin/catalogos/page.tsx`: empty state con mensaje (key i18n
  `adminCatalogs.empty` en los 4 locales).
- `/admin/facturacion/promos/page.tsx`: CTA único `Button href`.

## Fuera de alcance

- Ficha `/admin/campanas/[id]` con acciones movidas de las cards:
  las mutaciones de operación (probar/correr/cancelar) quedan en la
  card como en la cola de comprobantes; evaluar si amerita ficha es
  decisión de producto aparte.
- Cambios de API: `GET /admin/mail-campaigns/:id` ya existe.
