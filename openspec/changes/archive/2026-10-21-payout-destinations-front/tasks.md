# Tasks — payout-destinations-front

- [x] 1. Sección "Cuenta de desembolso" en `/productor/pagos`:
  lista destinos (status badge PENDING/ACTIVE/DISABLED + rail +
  moneda + onboardedAt) desde `GET /me/payout-destinations`;
  estados empty/loading (Skeleton)/error.
- [x] 2. Alta: CTA "Conectar con Stripe" → selector país ISO-2 →
  `POST /me/payout-destinations` → redirect a `onboardingUrl`;
  manejo 503 (Stripe no configurado), 409 (ya ACTIVE), 403.
- [x] 3. i18n `es-CL` (keys nuevas en el catálogo de la consola
  productor); craft-floor impeccable antes de editar + detect al
  final; console-patterns respetado.
- [ ] 4. `docs/qa-flows-inventory.md` actualizado + spec del change +
  commit en `dev` (orquestador).
