# Tasks: unified-action-notice

## Fase 1 - Host global + done-screens

- [x] 1. `ActionNotice`: host global en `(app)/layout.tsx` +
  `showActionNotice(notice)` (sessionStorage + evento; sobrevive
  `router.push`; host renderiza el mismo atom). Uso local intacto.
- [x] 2. Migrar ~21 done-screens/redirect-success: forms academy
  (series/staff/enrollment/plan/video), productor (evento, staff,
  academia, colaborador, código, lista), dancer (practicas/nueva,
  perfil/completar, survey-form), crm (triggers/segmentos/campañas),
  amigos/[id], precios/nuevo, claims híbridos: emitir vía host global +
  navegar sin timer; eliminar el done-screen.

## Fase 2 - Silenciosos

- [x] 3. Dar aviso a ~20 flujos sin feedback en éxito: admin usuarios
  [personId], perfiles-por-validar, roles, jobs, catalogos (create/
  edit/delete), promos/nueva, anular doc, campañas run/cancel/save,
  datos rename/delete, horarios/[slotId] (PATCH+DELETE, chequear
  res.ok), clases/[id] cancelClass (chequear res.ok), perfil/pagos
  cancelSub, colaboradores delete, venue rental, crm tags/segmento
  delete, analytics rename/delete, OTP verify, academia nueva.

## Fase 3 - Inline persistente

- [x] 4. Migrar ~35 flujos `{text,error}` inline a `ActionNotice`:
  consola academia (series/[id], alumnos, videos, claims, pagos,
  settings, profile, private-lessons, preventas, promos, billing clone),
  productor (eventos, acuerdos, comprobantes, medios de pago, gateway,
  fees, parametros, pro-section clone), admin (promos/[id], finanzas,
  analitica/datos notices), dancer (perfil/datos, TicketWallet, subir
  foto/idioma/jurisdicción silenciosos).

## Cierre

- [x] 5. tsc + tests web + qa-flows-inventory (feedback estándar) +
  archivar change.
