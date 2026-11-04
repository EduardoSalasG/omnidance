# Brief: impl-queryapi (backend personId para QueryTable drill)

Lee `docs/audit-briefs/_impl-common.md` primero (autoridad: design
§8 del change `console-audit-fixes`). Tu scope exclusivo:
`apps/api/src/query/**` y `packages/shared` SOLO si el type
`QueryRunResult` lo exige (preferir no tocarlo).

## Objetivo

El front `QueryTable` ya linkea la celda persona a
`/analitica/usuarios/[personId]` leyendo una celda suplementaria al
final de cada row (`row[headers.length]`, nunca una columna). El
backend hoy no la adjunta → el drill está dormido. Hay que
alimentarlo.

## Diseño vinculante

- `EntityResult` (apps/api/src/query/entities/helpers.ts): agregar
  campo opcional `personIds?: (string | null)[]` paralelo a `rows`.
- En cada mapper de entidad (`entities/academy.ts`, `admin.ts`,
  `producer.ts`): donde el sujeto de la fila es una Persona y el id
  ya se fetchea (`r.personId` ya está en la mayoría de los select),
  poblar `personIds` alineado por índice con `rows`. Donde no haya
  persona sujeto → omitir el campo o `null`. NO agregar selects
  pesados nuevos; `personId: true` en el select existente basta.
- `query.service.ts` `run()`: tras `handler.execute`, si
  `res.personIds` existe, `rows` devueltos =
  `res.rows.map((r, i) => [...r, res.personIds![i] ?? null])`.
- **`exportTable` MUST NOT** propagar la celda suplementaria (el CSV/
  PDF no gana columna oculta).
- Tests: `query.service.spec.ts` — agregar caso que afirme la celda
  suplementaria en run() cuando hay personIds y su ausencia en
  exportTable; ajustar los existentes si el shape cambia.

## Verificación

`cd apps/api && npx tsc --noEmit` y `pnpm --filter @omnidance/api
test` (o el runner vitest del paquete) verdes. NO uses git.
Reporta archivos + decisiones al final.
