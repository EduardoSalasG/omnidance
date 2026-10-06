# Tasks - admin-billing-documents

- [x] Schema: BillingDocument + BillingCounter + enums, relaciones
  Person/Payout; migración versionada.
- [x] AdminBillingService: generate (folio atómico + idempotencia
  payoutId + líneas del payout + snapshot receptor + PDF + pdfKey),
  list, candidates, void, listMine, pdfBuffer. Spec.
- [x] Controllers: /admin/billing (generate, list, candidates,
  :id/pdf, :id/void) + /me/billing (list, :id/pdf) — permisos y
  ownership. Spec.
- [x] PDF: common/billing-pdf.ts layout documento (emisor, receptor,
  folio, período, líneas, neto/IVA/total, disclaimer interno).
- [x] Front /admin/facturacion: candidates + generar + listado +
  descarga + anular con motivo; card en hub admin; i18n. Vista del
  actor: sección "Notas de cobro" en /productor/pagos.
- [x] Audit BILLING_ISSUE/BILLING_VOID; docs architecture/omni-dance
  (deuda declarada → implementado); openapi/postman regen; openspec
  validate; suite completa; commit en dev.
