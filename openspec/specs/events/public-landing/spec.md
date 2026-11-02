# events/public-landing Specification

## Purpose
TBD - created by archiving change public-event-landing. Update Purpose after archive.

## Requirements

### Requirement: Landing pública de captación por evento

El sistema SHALL exponer `/e/[id]` como página pública que muestra la
info del evento (nombre, fecha, venue, precio) accesible sin sesión;
su CTA de compra SHALL llevar a registro/login con `next=/eventos/:id`
para continuar el flujo estándar post-auth.

#### Scenario: Persona llega por link público y compra

- **WHEN** alguien abre `/e/evt1` sin sesión y presiona comprar
- **THEN** se le pide registro/login y al completarlo aterriza en
  `/eventos/evt1` con el flujo normal
