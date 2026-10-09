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

- [ ] 2.1 Auditar páginas del productor (eventos, guest-lists,
     discount-codes, cobros) y mapear desviaciones al patrón.
- [ ] 2.2 Crear = botón → página dedicada en cada módulo.
- [ ] 2.3 Cards completos clickeables → página de detalle.
- [ ] 2.4 Detalle: datos + edición + acciones destructivas en zona
     roja centrada.
- [ ] 2.5 Listas con FilterBar + Pager, skeletons, vacío y error
     con retry.

## 3. Verificación

- [ ] 3.1 `openspec validate` verde.
- [ ] 3.2 tsc web; i18n audit; `impeccable detect` sobre el diff.
