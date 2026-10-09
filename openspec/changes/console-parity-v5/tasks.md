# Tasks — console-parity-v5

## 1. Auditoría owner (fixes)

- [x] 1.1 `/academia/alumnos/[personId]`: `ConsoleHeader` con back a
     `/academia/alumnos` (era el único detalle sin back link).
- [x] 1.2 `/academia/equipo/[id]`: baja del colaborador en zona
     destructiva centrada en rojo (mismo patrón que profesor/medio).
- [x] 1.3 `/academia/equipo`: `h1 sr-only` duplicado eliminado (el
     chrome del appbar ya provee el h1 de página).
- [x] 1.4 Medios de pago: alta como página dedicada
     `/configuracion/pagos/nuevo`; listado con `SkeletonList`, estado
     de error con retry e `inputCls` compartido (era `<Spinner>`
     desnudo + clase duplicada + form inline).
- [x] 1.5 `/academia/series/[id]`: eliminar movido del action row a la
     zona destructiva del pie.
- [x] 1.6 `/academia/planes/[id]`: acción activar/desactivar
     (PATCH active) y alumnos del plan enlazan a su ficha.
- [x] 1.7 `videos.tsx`: delete inline con color destructivo.
- [x] 1.8 `academy-settings`/`academy-profile`: deep link sin permiso
     muestra "sin acceso" en vez de página en blanco.
- [x] 1.9 `cobros/claim/[id]`: error de aprobar/rechazar con
     `role="alert"` (era `role="status"`).
- [x] 1.10 Comentarios stale de comisión actualizados.

## 2. Paridad productor

- [x] 2.1 Auditoría de páginas del productor (eventos, códigos,
     listas, comprobantes, pagos, parámetros) — desviaciones mapeadas:
     `BackLink` ad-hoc en 4 páginas, `h1` duplicado en 4 páginas de
     crear, cards no clickeables, mutación inline en la cola de
     comprobantes, cancelar evento en el action row, `/me/payouts` sin
     paginar.
- [x] 2.2 `ConsoleHeader` en eventos, comprobantes, pagos y
     parámetros (reemplaza `BackLink`); `h1`→`h2` en eventos/nuevo,
     codigos/nuevo, listas/nueva y staff/nuevo (el appbar provee h1).
- [x] 2.3 Cards clickeables → ficha: eventos (ya estaba), códigos,
     listas, liquidaciones, comprobantes (pendientes e historial).
- [x] 2.4 Fichas nuevas: `/productor/codigos/[id]` (datos +
     redemptions), `/productor/listas/[id]` (invitados + alta + emitir
     pase), `/productor/pagos/[id]` (desglose por orden), y
     `/productor/comprobantes/claim/[id]` (datos + comprobante +
     aprobar/rechazar — la cola ya no muta inline).
- [x] 2.5 Cancelar evento movido del action row a la zona destructiva
     del pie (centrada, roja); `notFound` con `role="alert"`.
- [x] 2.6 API para las fichas: `GET /discount-codes/:id`,
     `GET /guest-lists/:id`, `GET /producer/claims/:claimId`,
     `GET /me/payouts` paginado (envelope) y `GET /me/payouts/:id`;
     `listRedemptions` enriquecido con nombre de la persona.
- [x] 2.7 Mutaciones de la cola de comprobantes (aprobar/rechazar)
     movidas a la ficha — paridad con `/academia/cobros/claim/[id]`.

## 3. Verificación

- [ ] 3.1 `openspec validate` verde.
- [ ] 3.2 tsc web; i18n audit; `impeccable detect` sobre el diff.
