## Why

Las academias que se presentan en los sociales venden preventa para el
productor y se quedan con un porcentaje (~50% típico en Santiago). Hoy eso
es un acuerdo verbal + caja + WhatsApp. Digitalizarlo en la plataforma
atribuye la venta (data CRM: qué academia mueve cuánta preventa) y deja la
obligación productor→academia registrada y auditable; sin que la
plataforma mueva esa plata: el productor regulariza directo con la
academia, nosotros solo computamos y exhibimos cuánto debe.

## What Changes

- **`AcademySaleAgreement`**: el productor invita academias (aprobadas) a
  vender la preventa de un evento o serie con un `commissionPct` pactado;
  la academia acepta/rechaza.
- **Atribución silenciosa**: la academia comparte su link
  (`?a=<academyId>`); `POST /checkout/ticket` con un acuerdo ACTIVE marca
  `Payment.soldByAcademyId` y congela `academyCommissionClp =
  round(unitListPrice × commissionPct)` por orden. Comprador: mismo
  precio, cero cambio visible.
- **Solo preventa**: la atribución aplica únicamente a órdenes
  `channel=PRESALE`; DOOR/series_pass/otros tipos no generan comisión.
- **Deuda, no payout**: el payout del productor NO se descuenta; la
  plataforma acumula la comisión devengada como obligación
  productor→academia por período. El productor la paga por fuera
  (transferencia) y la marca **pagada** en su consola; no hay
  confirmación del lado academia (decisión: marca unilateral).
- **Consolas**: productor ve acuerdos, ventas/comisión por academia y
  deuda pendiente por período con marcar-pagado (+comprobante opcional);
  academia ve sus acuerdos, su link, ventas acumuladas y cuánto le debe
  el productor.
- Editar el % solo afecta órdenes futuras (snapshot); desactivar el
  acuerdo mata la atribución futura, no las órdenes ya pagadas.

## Capabilities

### New Capabilities

- `payments/academy-presale-commission`: canal de preventa atribuido a
  academias con comisión porcentual; acuerdo invitado por el productor,
  atribución en checkout, comisión congelada por orden y regularización
  de la deuda productor→academia marcada pagada por el productor.

### Modified Capabilities

- `checkout/ticket-purchase`: el checkout acepta atribución de academia
  (`soldByAcademyId` + `academyCommissionClp`) cuando existe acuerdo
  ACTIVE para el evento; sin cambio de precio ni de UX del comprador.
- `payments/fee-model`: la descomposición congelada del `Payment` gana
  `academyCommissionClp`; el neto del productor en payout sigue siendo
  `amount − platformDeduction` (la comisión es pasivo del productor, no
  deducción de la liquidación).

## Impact

- API: `schema.prisma` (`AcademySaleAgreement`, `AcademySaleSettlement`,
  campos en `Payment`) + migración; checkout service; payouts/fee
  snapshot; nuevos endpoints productor y academia.
- Web: sección productor en ficha de evento; vista academia con su link
  y deuda; i18n es-CL.
- Docs: openapi/postman regenerados; `docs/architecture.md`,
  `docs/flows.md`, `omni-dance.md` §10.
- Sin cambios en pasarelas ni en payouts existentes.
