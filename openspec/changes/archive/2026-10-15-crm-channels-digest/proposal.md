# Proposal: crm-channels-digest

## Why

Dos gaps de canal vs industria: el bailarín lee WhatsApp, no push; y el
CRM es pull (hay que entrar a mirar) — el estándar empuja un resumen
periódico al operador.

## What Changes

- **WhatsApp por campaña**: `GET /crm/campaigns/:id/whatsapp?text=`
  devuelve, para la audiencia enviada (`result.audienceIds`), los
  `wa.me/<phone>?text=<msg>` de las personas con teléfono registrado.
  La ficha de campaña SENT ofrece escribir el mensaje y abrir los
  chats uno a uno (semi-manual honesto; la API oficial de WhatsApp
  queda como evolución).
- **Digest semanal**: job `crm.digest` (default lunes 09:00
  America/Santiago) notifica al owner de cada actor con universo un
  resumen de su CRM: total de personas y conteos por segmento
  (núcleo/en riesgo/nuevas/trae gente) sobre `RelationshipScore`.

## Out of scope

- WhatsApp Business API (envío automático por backend).
- Email/SMS como canales.
- Digest por persona (solo al owner del actor).
