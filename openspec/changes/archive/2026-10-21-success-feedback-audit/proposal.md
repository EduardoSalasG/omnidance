# Propuesta: feedback de éxito consistente en todas las mutaciones (success-feedback-audit)

## Why

El usuario reporta: "después de reservar la clase no aparece mensaje de
éxito, solo redirige a clases y la card se actualiza". La auditoría de
las 4 superficies (dancer, academia, productor, admin+soporte) confirma
el patrón: el feedback inline existe pero queda fuera del viewport tras
la acción, y decenas de acciones mutan sin confirmación perceptible;
incluidos fallos silenciosos en acciones de dinero.

## What Changes

- Nuevo atom `ActionNotice` (`components/ui`): aviso fijo sobre la
  BottomNav, `role="status"|"alert"`, auto-dismiss ~3s, motion-reduce
  safe. Cubre el caso "aviso fuera del viewport".
- Dancer: notices de error faltantes (PracticeBar RSVP, bailes act/rate,
  series review); `ActionNotice` en reserva de clase (lista + ficha) y
  cancel de clase particular (el notice actual se desmonta con el
  refresh); feedback de éxito en amigos (send/accept/decline/remove) y
  en "Tu baile" de perfil.
- Academia: notice en toggle de plan, responder preventa, aprobar/
  rechazar comprobante de cobro, guardar caps/acuerdo de equipo, crear
  medio de pago; el marcaje de asistencia actualiza el alumno in-place
  sin re-skeletonizar la página (regla ~5s en pista).
- Productor: chequeo de `res.ok` + notice en métodos de pago;
  ConfirmSheet previo en aprobar claim (liquida dinero), markPaid,
  eliminar colaborador y cancelar reserva de mesa; notice+redirect en
  forms CRM como el resto de la consola.
- Admin: notice de éxito Y error en approve/pay de finanzas, test de
  campaña, generate de facturación, convertLead, deleteSaved (con
  ConfirmSheet; componente compartido con /analitica), editor de cron
  que no se cierra si el PATCH falla; `role="status"` faltante en el
  notice de generate.

## Decisión de diseño

No se inventa un sistema de toasts global: el repo usa `notice` inline
con `role="status"`/`role="alert"` y ConfirmSheet; `ActionNotice` es un
atom de presentación para los casos donde el punto de acción queda fuera
del viewport; no un event bus ni state global.
