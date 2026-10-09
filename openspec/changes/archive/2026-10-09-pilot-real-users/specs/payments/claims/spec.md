# payments/claims — delta pilot-real-users

## ADDED Requirements

### Requirement: Selector de método siempre visible en el checkout

El selector "cómo pagar" del checkout de eventos SHALL renderizarse
siempre — aunque el productor no tenga métodos propios activos — con
la pasarela de la plataforma como única opción seleccionada. El
comprador MUST poder ver con qué medio se realizará el cobro antes de
confirmar la orden.

#### Scenario: sin métodos propios

- **WHEN** el comprador abre el checkout de un evento cuyo productor
  no tiene métodos propios activos
- **THEN** el selector se muestra con la pasarela como única opción
  marcada (radio deshabilitable en `busy`, sin métodos extra)

#### Scenario: con métodos propios

- **WHEN** el productor tiene métodos propios activos
- **THEN** el selector ofrece pasarela + cada método propio y mantiene
  el comportamiento de selección existente
