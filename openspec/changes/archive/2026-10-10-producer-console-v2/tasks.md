# Tasks — producer-console-v2

## 1. Configuración dividida

- [x] 1.1 `/productor/parametros` → "Valores por defecto" (solo mesas +
  aforo sentable + corte de preventa; sin Pro/gateway/métodos/tema)
- [x] 1.2 `/productor/suscripcion` nueva: `ProducerProSection` +
  `FeeParamsSection` (comisión read-only) + `ProReturnNotice`; el
  retorno `?pro=ok` del webhook `platform-customer-return` apunta acá
- [x] 1.3 `/productor/medios-pago` nueva: `GatewayAccountSection` +
  `ProducerPaymentMethodsSection`
- [x] 1.4 `/productor/apariencia` nueva: `ThemeToggle`
- [x] 1.5 Nav: grupo Configuración con Defaults / Medios de pago /
  Suscripción / Mis pagos / Apariencia; `PRO_SECTION_HREF` → suscripción
- [x] 1.6 i18n: `producerParams.title` → "Valores por defecto" +
  `feeTitle`; `producer.configPages.*` — verifica: `ALL_KEYS_OK`

## 2. Listas de invitados en la ficha del evento

- [x] 2.1 `EventListsSection` en `/productor/eventos/[id]` (carga las
  listas del evento directo, filtros, pager, CTA crear)
- [x] 2.2 `/productor/listas` → redirect a `/productor/eventos`;
  sidebar sin el ítem
- [x] 2.3 `listas/nueva?eventId=` preselecciona el evento y vuelve a la
  ficha; `listas/[id]` back a la ficha del evento dueño

## 3. Comprobantes como cola masiva

- [x] 3.1 `ProducerClaimsQueue`: cola PENDING completa primero +
  historial resuelto + FilterBar + Pager; empty state con
  `queueEmpty`/`queueEmptyDesc` (nunca página en blanco)
- [x] 3.2 Ficha del claim con aprobar/rechazar (ya existía - verificado)

## 4. Ficha del evento

- [x] 4.1 `ReservationsSection`: REQUESTED con Confirmar/Cancelar,
  CONFIRMED con Guardar cambios/Cancelar, errores por fila y refresh
- [x] 4.2 Orden de secciones y zona destructiva al pie (verificado)

## 5. Dashboard + notificación de venta

- [x] 5.1 Tops en la misma fila desktop: facturación izquierda,
  asistencia derecha; cobros por revisar como sección propia
- [x] 5.2 `ticket.sale` al productor en `settleTicket` (PAID) con
  deep-link al evento; sin autoaviso cuando el comprador es el
  productor — spec en `payment-settlement.service.spec.ts`

## 6. Seed

- [x] 6.1 Edición pasada CLOSED + ventas del mes + lista de invitados +
  claims PENDING para muvet
- [x] 6.2 Aforo masivo: 150-350 entradas/evento (vie/sáb 250-350),
  pagos PAID, ~85% check-ins en pasados, `createMany` + skip por conteo
- [x] 6.3 Reservas de mesa: eventos con `tablesTotal`/`tableSeatMax`/
  `tableSeatsTotal` y mezcla REQUESTED/CONFIRMED/CANCELLED
- [x] 6.4 Corrido y verificado contra la DB local (counts citados)

## 7. Verificación + entrega

- [ ] 7.1 `tsc --noEmit` web + api; `i18n-audit` ALL_KEYS_OK; tests
  afectados; `impeccable detect` sobre el diff
- [ ] 7.2 `openspec validate --changes` verde; archivar el change
- [ ] 7.3 Auditoría UX/a11y de páginas del productor (ConsoleHeader,
  un h1, role=status/alert, touch targets, empty/error/loading)
- [ ] 7.4 Commit en dev (sin co-autoría)
- [ ] 7.5 Release: version bump + changelog + `dev→main` + tag + deploy
  supervisado (gate de release - pedir confirmación)
