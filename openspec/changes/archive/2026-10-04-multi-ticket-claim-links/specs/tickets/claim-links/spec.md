# Capability: tickets/claim-links

## Purpose

Entradas compradas pero no asignadas a un usuario concreto: el comprador recibe un link de reclamo compartible (WhatsApp) y el destinatario — registrado o no — reclama la entrada creando cuenta o entrando. Cierra el flujo "te compro la entrada y te la paso" sin exigir que el destinatario exista en la app al momento de la compra.

## ADDED Requirements

### Requirement: emisión de entradas reclamables al pago
Al confirmarse el pago (webhook PAID) de una orden de `quantity` tickets con `R` destinatarios amigos, el sistema SHALL emitir `quantity` tickets: 1 para el comprador, `R` para los amigos, y `quantity - 1 - R` tickets **reclamables** — con `ownerId` del comprador y un `claimToken` único aleatorio.

#### Scenario: orden de 4 tickets, 1 amigo asignado
- **WHEN** el webhook marca PAID una orden con quantity=4 y 1 recipientId
- **THEN** existen 4 tickets ACTIVE: 1 owner=comprador, 1 owner=amigo (giftedFromId=comprador), 2 owner=comprador con claimToken no nulo

#### Scenario: el comprador ve sus entradas pendientes de reclamo
- **WHEN** el comprador consulta `GET /tickets/mine`
- **THEN** las entradas reclamables aparecen con su `claimToken` (para generar el link de invitación)

### Requirement: landing pública de reclamo
La ruta `/reclamar/[token]` SHALL ser accesible sin sesión y mostrar: quién regaló (nombre del comprador), evento (nombre, fecha, venue) y CTA "Crea tu cuenta" / "Ya tengo cuenta" que preservan el token vía `next`. El endpoint `GET /tickets/claim/:token` SHALL ser público y exponer solo datos de invitación (nombre del comprador, evento) — sin personIds internos ni datos del comprador más allá del nombre.

#### Scenario: destinatario anónimo abre el link
- **WHEN** un usuario sin sesión abre `/reclamar/{token}` válido
- **THEN** ve "{nombre} te regaló una entrada para {evento}" con CTA a crear cuenta o entrar, sin ser redirigido a otra pantalla primero

#### Scenario: token inválido o ya usado
- **WHEN** se consulta `GET /tickets/claim/{token}` inexistente o ya reclamado
- **THEN** responde 404 (o estado equivalente) y la página muestra "este link ya no es válido"

### Requirement: reclamar la entrada
`POST /tickets/claim/:token` con sesión SHALL asignar el ticket al reclamante: `ownerId=reclamante`, `giftedFromId=comprador`, `claimedAt=now`, `claimToken=null`. El `buyerId` original SHALL permanecer (trazabilidad del pago). El reclamo SHALL notificar al comprador que su regalo fue reclamado y por quién.

#### Scenario: reclamo exitoso
- **WHEN** un usuario autenticado distinto del comprador hace POST con token válido
- **THEN** el ticket queda ACTIVE con ownerId del reclamante, aparece en su `GET /tickets/mine`, y el comprador recibe notificación "X reclamó la entrada que le regalaste"

#### Scenario: el comprador intenta reclamar su propio link
- **WHEN** el comprador del ticket hace POST a su propio claimToken
- **THEN** 400/409 — el ticket ya es suyo

#### Scenario: reclamar dos veces
- **WHEN** dos personas intentan reclamar el mismo token
- **THEN** solo la primera obtiene el ticket; la segunda recibe 404/410

#### Scenario: entrada usada o transferida manualmente
- **WHEN** el ticket con claimToken ya está USED o el comprador lo transfirió por `/tickets/:id/transfer`
- **THEN** el reclamo falla (409/404): el transfer manual limpia el claimToken y un ticket no-ACTIVE no es reclamable

### Requirement: compartir por WhatsApp
La UI SHALL ofrecer por cada entrada pendiente de reclamo un botón "Enviar invitación" que abre `https://wa.me/?text={mensaje con link}` — en el éxito del checkout (una vez confirmado el pago) y en la wallet (`/eventos?view=mios`) mientras la entrada siga sin reclamar.

#### Scenario: compartir desde la wallet
- **WHEN** el comprador ve una entrada con claimToken en Mis entradas
- **THEN** el botón abre WhatsApp con texto prellenado: quién regala, para qué evento y el link de reclamo

#### Scenario: la entrada ya fue reclamada
- **WHEN** el destinatario reclamó el ticket
- **THEN** la entrada desaparece de la wallet del comprador (ownerId cambió) — no queda badge ni link activo
