# Delta: admin (admin-billing-documents)

## ADDED Requirements

### Requirement: emisión idempotente de documento por liquidación

El sistema SHALL emitir un `BillingDocument` por payout con folio
correlativo único asignado atómicamente (sin saltos ni duplicados bajo
concurrencia). Emitir dos veces sobre el mismo payout SHALL devolver
el documento existente, sin crear otro ni consumir folio.

#### Scenario: generar sobre payout nuevo

- **WHEN** el admin genera el documento de un payout con líneas de
  cargo (PLATFORM_FEE_*, OWN_METHOD_FEE_*, GATEWAY_FEE_PASSTHROUGH)
- **THEN** se crea el documento ISSUED con folio correlativo, líneas
  agregadas por tipo, net/IVA/total del payout y snapshot del receptor
  (RUT/razón social de FiscalProfile si existe, si no nombre), queda
  auditado BILLING_ISSUE y el PDF se persiste en storage privado

#### Scenario: doble generación concurrente

- **WHEN** dos requests generan sobre el mismo payout
- **THEN** el segundo obtiene el documento existente (payoutId único),
  ningún folio se consume dos veces

#### Scenario: payout sin cargos

- **WHEN** el payout no tiene líneas de cargo
- **THEN** responde 400 sin emitir documento

### Requirement: anulación auditable

El sistema SHALL marcar VOID un documento (requiere motivo), conservando
el PDF como evidencia y auditando BILLING_VOID. Un VOID no puede
re-emitirse como ISSUED; la emisión posterior sobre el mismo payout
sigue devolviendo el documento existente.

#### Scenario: void con motivo

- **WHEN** el admin anula un documento con motivo no vacío
- **THEN** status=VOID + voidReason + BILLING_VOID auditado; el PDF
  sigue descargable como evidencia

### Requirement: acceso del actor a sus documentos

El sistema SHALL exponer al actor sus propios documentos ISSUED
(`GET /me/billing`) y su PDF (`GET /me/billing/:id/pdf`), sin acceso
a documentos ajenos ni a estados VOID por la vista de actor.

#### Scenario: listado propio

- **WHEN** el productor consulta /me/billing
- **THEN** ve solo sus BillingDocument ISSUED; documentos ajenos y
  VOID quedan fuera
