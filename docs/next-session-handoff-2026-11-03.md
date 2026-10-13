# Handoff — 2026-11-03

## Completado esta sesión

### `academy-presale-commission` — implementado y archivado

Preventa vendida por academias como canal atribuido (modelo acordado con el
usuario: la plataforma **registra** la deuda productor→academia, no la paga;
el productor marca pagado unilateralmente con comprobante opcional).

- **Datos**: `AcademySaleAgreement` (XOR evento/serie, `commissionPct` 1-90,
  `maxTickets?`, INVITED→ACTIVE/DECLINED/DISABLED), `AcademySaleSettlement`
  (marca de pago materializada al marcar, `amountDue` + `evidenceUrl?`),
  `Payment.soldByAcademyId`/`academyCommissionClp` (snapshot por orden).
  Migración `20261103000000_academy_sale_deals` aplicada al Postgres Docker.
- **Dominio**: `payments/application/academy-sales.service.ts` — creación con
  owner/admin + academia aprobada (active + `ACADEMY_OWNER` APPROVED del
  owner), accept/decline/disable/edit, `resolveAttribution` (solo
  `channel=PRESALE`, acuerdo ACTIVE del evento **o de su serie**, cupo
  `maxTickets`), deuda computada = Σ `academyCommissionClp` PAID − Σ
  settlements. Ojo: `Payment` no tiene relación `event` — el alcance de serie
  resuelve `event.findMany({seriesId})` → `eventId IN (...)`.
- **Checkout**: `academyId` opcional en `POST /checkout/ticket`; atribución
  silenciosa (sin acuerdo → orden normal sin error); `FEE_ASSESSED` lleva
  `soldByAcademyId`/`academyCommissionClp` cuando hay atribución.
  `producerNetClp` intocable.
- **Endpoints** (`academy-sales.controller.ts`, multi-prefijo):
  `POST|GET /events/:id/academy-deals`, `PATCH /academy-deals/:id`,
  `GET /academies/:id/sale-deals`, `POST /academy-deals/:id/mark-paid`.
- **Front**: `?a=` persiste en `sessionStorage` por evento
  (`components/checkout/academy-attribution.tsx` montado en la landing);
  el checkout lo manda como `academyId`. Productor: sección
  `AcademySalesSection` en `/productor/eventos/[id]` + `/academias/nueva`
  + ficha `/academias/[agreementId]` (editar %/cupo, copiar link,
  marcar-pagado con evidencia, desactivar en zona roja). Academia:
  `/academia/preventas` + ficha con aceptar/rechazar; entrada en drawer
  owner + grilla staff (cap `payments`).
- **i18n**: nuevo part `src/i18n/parts/academySales.json` (+`academy.modules.
  presales`).
- **Docs**: `architecture.md` (fila payments + modelos + bullet Pasarela),
  `flows.md` (sequenceDiagram nuevo), `omni-dance.md` §10 subsección nueva,
  openapi/postman regenerados (284 paths).
- **OpenSpec**: archivado como `2026-10-13-academy-presale-commission`;
  deltas volcados a specs canónicas (ticket-purchase, fee-model,
  academy-presale-commission nuevo).

## Evidencia

- `vitest run src/payments`: 462/462 verdes (incl. `academy-sales.service.spec`
  16 tests, `academy-sales.controller.spec` 7 tests, checkout +5 de
  atribución).
- `tsc --noEmit` api + web limpio; `i18n-audit.cjs` → `ALL_KEYS_OK`;
  `openspec validate --changes` 3/3 (antes del archive).
- Rutas vivas verificadas: 401 sin sesión en los 3 endpoints sondeados.

## Brechas conocidas / pendientes

- **Sin smoke E2E de la compra atribuida** contra DB real (los specs cubren
  el camino; falta una compra real con `?a=` en dev).
- `GET /academy-deals/:id` no existe — las fichas resuelven desde el listado
  (suficiente en v1; si el volumen crece, agregar endpoint por id).
- Acuerdos de serie: el front solo arma link del evento en contexto; la
  academia ve el hint "vale para toda la serie".
- `webhook`/settle no tocan `soldByAcademyId` — la comisión vive solo en el
  Payment; reportes de deuda por período son un siguiente slice si se pide.

## Próximo slice sugerido

- QA manual del flujo completo (invitar → aceptar → comprar con link →
  ver deuda → marcar pagado) contra el stack local.
- Pendientes de gamificación §7 y social §8 del gap-analysis anterior
  (misiones como producto, comentarios en prácticas, feed off-night).
