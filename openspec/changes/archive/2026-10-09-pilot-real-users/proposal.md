# pilot-real-users — seed de usuarios reales + claim de cuenta + checkout transparente

## Why

Para probar la plataforma en producción con usuarios reales (Mónica,
María, Gabriel) hacen falta dos cosas que el sistema no permitía:

1. **Personas pre-sembradas por email**: el seed puede poblar data
   rica (entradas, amigos, bailes, academias) pero el registro
   devolvía 409 pelado — el usuario real no podía entrar a su cuenta
   sin conocer el flujo de magic link.
2. **Checkout transparente**: cuando el productor/academia no tiene
   métodos propios, el comprador no veía con qué pagaba — la pasarela
   quedaba implícita.

Además el batch prepara el piloto productivo: `SEED_ENV=prod` corre
temporalmente el dataset demo (con los usuarios reales) y el seed
productivo real queda preservado para restaurar el dispatch al cerrar
el piloto. El seed dev se enriquece con data real de la escena
(Trilogía 5ta edición, academia Adrian y Leo, MercadoPago en Mambo
Madness) y con limpieza automática de residuos E2E.

## What

- **Register reclama cuentas pre-sembradas**: `POST /auth/register`
  sobre email existente ya no solo 409 — si el password coincide con
  `passwordHash` emite sesión (equivale a login); si no coincide o la
  cuenta nunca tuvo password, envía un magic link y responde 409
  orientador. El `verify` existente hace `upsertByEmail` → la Person
  sembrada queda asociada a la sesión con toda su data.
- **Método de pago siempre visible**: `OwnMethodPicker` (eventos) y
  `ManualPayPanel` (academias) se renderizan aunque no haya métodos
  propios — la pasarela queda como única opción marcada.
- **Seed con usuarios reales**: Gabriel (owner/instructor/dancer),
  Mónica (`monica@omnidance.cl`, password), María
  (`maria@omnidance.cl`, dancer+instructora en Mambo Madness), academia
  "Adrian y Leo" (solo mambo), muvet owner también instructor,
  MercadoPago como PAYMENT_LINK en Mambo Madness.
- **Trilogía 5ta edición**: serie/evento del sábado en Orixas (Carlos)
  con mezcla 50/40/10, aforo 350 en 3 tramos (lista $5.000 vía
  `GuestList.specialPrice`, preventa $6.000, puerta $8.000), 3 DJs,
  programa del flyer y shows por `showRosters`.
- **Cleanup E2E en seed**: cascada explícita que elimina academias,
  series, venues y eventos de test (marcas + raíces de specs +
  em-dashes legados) sin tocar data curada.
- **Poda de estilos**: la depuración manual de prod (`Salsa on2`,
  `Bachata dominicana`) pasa a `seed-common` — refs personales se
  borran, refs estructurales quedan en null.
- **Dispatch del piloto**: `SEED_ENV=prod` → dataset demo +
  `SEED_ADMIN_EMAIL` opcional; `SEED_ENV=baseline` → el seed real de
  prod (`seed-prod-baseline.ts`).

## Impact

- Specs afectadas: `payments/claims` (selector siempre visible),
  `academies/payment-claims` (panel de medio de pago siempre visible),
  `legal-consent` (reclamo de cuenta en register).
- Código: `auth.controller.ts` (+spec), `own-method-picker.tsx`,
  `checkout-client.tsx`, `manual-pay-panel.tsx`, `seed.ts`,
  `seed-dev.ts`, `seed-common.ts`, `seed-prod-baseline.ts` (nuevo).
- Datos: solo seed — sin migraciones ni cambios de contrato.
- Compatibilidad: `register` cambia su respuesta a email existente de
  "409 sin acción" a "sesión o magic link + 409"; `SEED_ENV=prod` deja
  de sembrar solo baseline mientras dure el piloto (restaurar al
  cerrar).
- Riesgo operativo: correr `SEED_ENV=prod` en prod siembra el dataset
  demo — es el comportamiento deseado del piloto, documentado en
  `docs/ci-cd.md` y `docs/architecture.md`.
