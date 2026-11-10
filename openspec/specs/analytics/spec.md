# analytics Specification

## Purpose
TBD - created by archiving change auth-sessions. Update Purpose after archive.

## Requirements

### Requirement: Telemetría de instalación y dispositivo

El front SHALL emitir un evento `app.launch` (una vez por arranque) con
metadata `{displayMode: standalone|browser, platform, ua}` que el API
SHALL persistir en `AnalyticsEvent`. `PushToken` SHALL registrar
`userAgent`/`platform` al suscribirse. La consola `/analitica` lente
ADMIN SHALL exponer la entidad `dispositivos`: altas por modo
(instalada/browser), por plataforma, con filtros `from`/`to` y
`platform` multi.

#### Scenario: Conteo de instaladas

- WHEN una PWA instalada arranca y una browser arranca el mismo día
- THEN la entidad `dispositivos` muestra ambos modos separados

### Requirement: Privacidad de la telemetría

El evento `app.launch` SHALL ser agregable y no SHALL incluir
identificadores de dispositivo estables (fingerprint). El personId se
asocia solo si hay sesión; anónimo también cuenta.

#### Scenario: Lanzamiento anónimo

- WHEN un browser sin sesión emite `app.launch`
- THEN se persiste con personId null y cuenta igual en la entidad
