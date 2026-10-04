# seed-live-sessions — Corregir invitaciones de baile en el seed

## Why

El seed creó invitaciones `INVITED` sobre la próxima Bachatamanía — un evento futuro. El flujo de la spec §4 contradice eso: la invitación nace del escaneo QR **durante** el evento y vive solo en la noche (expira ~24h). Una invitación pendiente sobre un evento que no ha ocurrido es un estado imposible.

## What Changes

- Las invitaciones `INVITED` se mueven de la próxima Bachatamanía a un evento **LIVE** en curso ("Social en vivo" esta noche, de 2h atrás a +4h), que además alimenta el hero de `/inicio`.
- El historial (`CONFIRMED`/`RATED`/`DECLINED`) se mantiene en la edición pasada — esos son escaneos ya resueltos.

## Capabilities

### Modified Capabilities
- `social-modules-scope`: `/bailes` muestra invitaciones solo sobre eventos en curso.
