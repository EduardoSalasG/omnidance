# Delta: console-crud-flows

## MODIFIED Requirements

### Requirement: Toda mutación visible al usuario emite feedback perceptible

Toda acción del usuario SHALL comunicar su resultado con `ActionNotice`
(estándar único de feedback post-acción, todos los perfiles). El aviso
SHALL sobrevivir a la navegación inmediata: un flujo que navega tras
mutar (crear → listado) MUST emitir el aviso vía el host global para que
se muestre en el destino.

Un cambio de estado implícito (badge, fila que desaparece, redirect sin
aviso) SHALL NOT ser el único feedback. Fallos SHALL producir feedback
de error perceptible (`role="alert"`), nunca silencio. Excepciones
permitidas: switch optimista reversible, pantalla terminal (pago,
encuesta entregada), banner de retorno de pasarela por query param,
feedback in-situ bajo la regla de ~5s (scanner en pista), ConfirmSheet
como paso previo.

#### Scenario: reserva de clase desde la lista scrolleado abajo

- **WHEN** el usuario reserva una clase desde `/clases` estando en la
  parte baja de la lista
- **THEN** ve la confirmación de éxito sin scrollear (ActionNotice fijo)

#### Scenario: aprobar comprobante de cobro

- **WHEN** productor/admin aprueba un claim/comprobante
- **THEN** hay confirmación previa (ConfirmSheet) o el feedback de éxito
  es explícito antes de la navegación

#### Scenario: acción de dinero falla

- **WHEN** approve/pay/generate del admin o métodos de pago del
  productor fallan (no-ok o error de red)
- **THEN** el usuario ve un error perceptible con role="alert"

#### Scenario: crear entidad desde form dedicado

- **GIVEN** el usuario guarda en `/nuevo` y el flujo redirige al listado
- **WHEN** la mutación responde OK
- **THEN** el aviso de éxito se muestra en el listado destino (host
  global), sin pantalla intermedia ni timer artificial

#### Scenario: mutación silenciosa gana aviso

- **GIVEN** una acción cuyo único resultado visible era la fila que
  desaparecía o un reload
- **WHEN** el usuario la ejecuta
- **THEN** `ActionNotice` confirma el éxito o muestra el error;
  respuestas no-ok se reportan (no se ignoran)

#### Scenario: inline persistente migra a aviso flotante

- **GIVEN** una página que mostraba `<p role="status">` permanente tras
  guardar
- **WHEN** el usuario muta
- **THEN** el resultado sale por `ActionNotice` con auto-dismiss
