# Tasks; platform-promos

- [x] 1. Schema: modelo PlatformPromo + relaciones + migración
  versionada + seed (1 promo ejemplo o vacío).
- [x] 2. API: CRUD admin `/admin/platform-promos` + resolución de promo
  vigente por actor en chargeSpec (whitelist + ventana + maxCycles por
  conteo de payments de la sub) + effective price en vista de billing
  del actor + MRR con precio efectivo.
- [x] 3. Web: página admin de promos (listar/crear/editar con patrón
  consola) + precio tachado/oferta en /academia/suscripcion y
  productor cuando aplique.
- [x] 4. Specs: cálculo de descuento (percent/fixed), whitelist,
  maxCycles agotado → precio lleno, expiración por fecha.
- [x] 5. Docs: openapi/postman regen, qa-inventory, omni-dance.md §10.
