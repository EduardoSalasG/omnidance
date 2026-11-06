# Handoff 2026-11-06 - export CSV/PDF del reporte de cobros + PDF con marca

## Tarea pendiente (pedido del usuario, sin implementar aún)

1. `/academia/cobros/reporte` necesita export **csv y pdf**.
2. El PDF con **diseño limpio de reporte**: título, período, filtros
   aplicados, KPIs (Facturado, Alumnos, Métodos de pago) y la tabla.
3. El estilo de marca se **extiende a todos los PDF de Analítica**
   (restylear el builder compartido, no crear uno nuevo por página).

## Inteligencia ya recolectada (no re-leer)

- **Datos**: `GET /academies/:id/billing-report`
  (`apps/api/src/academies/infrastructure/academy-claims.controller.ts:318`)
  → `claims.billingReport(id, {createdAt, planId, status, pg})`
  (`academy-claims.service.ts:615`). Params: `from,to,planId,status,
  page,pageSize`. Sin from/to default = mes calendario en curso UTC.
  Respuesta: `{billed, payers, byMethod:[{method,amount,count}],
  topPlan, items:[{id,kind,personName,planName,amount,currency,
  status,method,createdAt}], total, page, pageSize}`.
  Cap requerida: `payments` (misma que la página).
- **PDF builder compartido**: `buildTablePdf` en
  `apps/api/src/common/pdf-report.ts` (pdfkit, A4). Usado por
  `query.controller` `GET /query/export.pdf` y por
  `common/billing-pdf.ts`. **Restylear aquí hereda marca en todos
  los exportes** (Analítica incluida): hoy header de tabla #1a1a2e
  genérico.
- **Marca** (`apps/web/src/app/globals.css`): accent =
  `rgb(124 58 237)` = **#7c3aed** (tema oscuro default); accent-soft
  #6d28d9; ink oscuro #0B0B10 (on-accent 11 11 16). Para PDF
  imprimible: fondo blanco + banda de header violeta (#7c3aed o
  degradado a #6d28d9) + título bold + acentos violeta en header de
  tabla, filas alternas sutiles (#f5f3ff o gris muy claro), footer
  con marca/fecha/paginación.
- **CSV**: `apps/api/src/common/csv.ts` es solo parser; el query
  export serializa inline en `query.service.ts` (revisar cómo arma el
  texto CSV en `exportTable`/controller `export.csv` ~línea 148-172:
  `Content-Type: text/csv; charset=utf-8`).
- **Front**: la página del reporte está en
  `apps/web/src/app/[locale]/(app)/academia/cobros/reporte/page.tsx`
  (fetch a `/academies/${academyId}/billing-report` con qs de filtros
  + paginación 20/10). Los botones csv/pdf de Analítica sirven de
  patrón visual (están en la misma página analitica/page.tsx).
- Diseño sugerido endpoints: `GET /academies/:id/billing-report.csv`
  y `.pdf` con los mismos params de filtro (from,to,planId,status) y
  take alto (ej 5000) en vez de paginar. El PDF: título "Reporte de
  cobros", subtítulo `{academia} · {período}`, líneas summary con
  filtros aplicados + `Facturado $X · Alumnos N`, sección/tablas por
  método (o columna método), tabla Fecha/Alumno/Plan/Método/Estado/
  Monto.

## Estado de los commits (todo al día)

dev está limpio. Últimos: `5ebabf9a` drop classId, `2ab89a34`
cascada acumulativa, `997ac5b2` cascada+nivel, `cd53a12f` nav-order+
deleted options, `53aaa848` analitica-ux, `3cd98970` seed+smoke.
Smoke `apps/api/scripts/smoke-ux-review.cjs` 12/12 (login con
waitForLoadState networkidle + setLens ACADEMY_OWNER por
localStorage; throttle auth 8/min con retry 65s).

## Reglas del usuario vigentes

- Paginación 20 desktop / 10 mobile en listas pesadas
  (`useConsolePageSize`).
- Sin tecnicismos en copy (labels humanos, enums traducidos vía
  payments.media.* / query.optionLabels).
- "método de pago" como terminología.
- Fix en un tier aplica a todos.
- Openspec change obligatorio (G2) + `openspec validate` + archive
  al commitear; inventario `docs/qa-flows-inventory.md` en el mismo
  cambio; sin `—`/`--`/` - ` en copy/docs/commits.
