# Tasks — productor-desembolso-page

- [x] 1. Página `/productor/desembolso` (console-patterns: ConsoleHeader,
  gate de rol producer, SkeletonList, estado 503/unavailable) que
  monta `DisbursementAccountSection`; sacar la sección de
  `/productor/pagos`.
- [x] 2. BottomNav: mover ítem `/productor/pagos` ("Mis pagos") del
  grupo Configuración al grupo de módulos del productor (tras
  Comprobantes); agregar ítem `/productor/desembolso` en el grupo
  Configuración tras Medios de pago; `SIDEBAR_ROUTES` ya cubre el
  nuevo href vía DRAWER_BY_ROLE.
- [x] 3. i18n es-CL: `producer.configPages.disbursement` +
  `producer.navGroups`/título de página si aplica; parts en/fr/pt-PT
  en el batch de completitud.
- [x] 4. `check_index_coverage` / grep por links internos que apunten
  a `/productor/pagos` esperando la sección de desembolso (banners,
  empty states, onboarding) y redirigirlos a `/productor/desembolso`.
- [x] 5. qa-inventory (ruta nueva + movimiento de nav) + docs;
  validate + archive.
