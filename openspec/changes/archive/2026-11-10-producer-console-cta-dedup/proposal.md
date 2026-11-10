# Proposal: un solo CTA de crear en superficies del productor

## Resumen

Auditoría de la consola del productor con los mismos patrones del
change `academy-console-cta-gating` (QA sobre COBROS). Resultado:

1. La ficha del evento (`academy-sales-section.tsx`, "Preventa por
   academias") duplica el CTA `＋ Invitar`: header de sección +
   botón dentro del empty state.
2. `/productor/medios-pago` (`payment-methods-section.tsx`) duplica
   el CTA "Agregar método": header de la card + botón dentro del
   empty state.
3. Causa raíz: la spec compartida `console-crud-flows` sigue exigiendo
   "Estado vacío con CTA" (empty state SHALL ofrecer el botón de
   crear) - contradice la regla nueva de un solo CTA por pantalla que
   `academies/console-lists` ya adoptó. Las dos superficies siguen la
   spec vieja, no un descuido del código.

Patrones auditados sin hallazgos en productor: no existe selector de
productor (la persona es la entidad, no hay multi-productor); ningún
flujo de crear está gateado por feature del plan (PRODUCER_FEATURES =
analytics/crm/exports/campaigns/benchmark y ninguna cierra el alta);
los paywalls vigentes (analytics en ficha de evento, `/crm` por
actor) ya ocultan sus CTAs correctamente; eventos, códigos,
colaboradores, pagos, comprobantes, listas, staff y las listas del
CRM tienen empty state de solo mensaje.

## Alcance

- `academy-sales-section.tsx`: eliminar el `Button` `＋ Invitar` del
  empty state (queda el mensaje; el CTA del header de sección
  permanece).
- `payment-methods-section.tsx`: eliminar el `Button` "Agregar
  método" del empty state (queda el mensaje; el CTA del header de la
  card permanece).
- Spec `console-crud-flows`: el requisito "Estado vacío con CTA" pasa
  a exigir un solo CTA de crear por pantalla (header/sección); el
  empty state muestra solo mensaje, salvo superficies sin CTA propio
  (dashboard con cero actividad conserva su CTA de primer evento).

## Fuera de alcance

- Gating de CTAs por tier en productor: no aplica (ninguna feature
  del plan cierra un alta). El paywall ya gatea analytics/CRM.
- Consola admin/soporte: puede necesitar la misma pasada; no
  auditada en este change.
- Cambios de API: nada que tocar - es solo alinear UI y spec.
