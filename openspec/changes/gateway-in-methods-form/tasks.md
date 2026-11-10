# Tasks: pasarela dentro del flujo de métodos de pago

## Academia

- [ ] 1.1 `/academia/configuracion/metodos-de-pago/nuevo`: selector de
  tipo al inicio (manual vs pasarela). Rama manual = form actual
  intacto. Rama pasarela = select FLOW/MERCADOPAGO/FINTOC + apiKey +
  secret condicional (`NEEDS_SECRET`: FLOW/FINTOC) + copy de la
  webhookUrl resultante. Submit → `PUT
  /academies/:id/gateway-account` + `ActionNotice`.
- [ ] 1.2 La lista de métodos muestra la cuenta de pasarela como card
  (badge tipo + mask + status + acceso a ficha/edición + disable con
  zona roja según `console-patterns`). Componer vía `GET
  .../gateway-account` (view mask) - la lista ya es client-side,
  agregar el fetch paralelo o integrarlo al payload si es trivial.
- [ ] 1.3 Eliminar `AcademyGatewaySection` de la página (mover su
  lógica al flujo); la página queda con una sola lista unificada.

## Productor

- [ ] 2.1 Espejo en `/productor/medios-pago`: mismo flujo unificado
  con `ProducerGatewaySection` (endpoints `/producers/gateway-account`
  o el que exista - verificar path real).

## Cierre

- [ ] 3.1 Keys i18n nuevas solo es-CL; paridad `i18n-parity.cjs` sin
  drift. Copy sin guiones largos.
- [ ] 3.2 `qa-flows-inventory.md` actualizado (alta/edición/disable de
  pasarela por flujo unificado).
- [ ] 3.3 Verde: `pnpm --filter @omnidance/web typecheck` + lint +
  tests del page/spec afectados + `openspec validate --changes`.
- [ ] 3.4 Skill `impeccable`/`console-patterns` aplicada (la página es
  consola): revisar craft antes de cerrar.
