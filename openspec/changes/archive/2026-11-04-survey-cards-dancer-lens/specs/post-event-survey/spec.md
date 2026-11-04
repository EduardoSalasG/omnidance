# Delta: post-event-survey

## MODIFIED Requirements

### Requirement: Activación de la encuesta

Al terminar el evento SHALL notificarse a cada asistente (`notifySafe`:
in-app + push best-effort, una vez por evento/persona) y `/inicio` MUST
mostrar una card "¿Cómo estuvo [evento]?" durante la ventana, que
desaparece al evaluar o expirar. La card SHALL mostrarse únicamente en
el apartado **Social** del inicio del bailarín (`activeRole ===
"DANCER"` con `viewMode === "social"`): las consolas de otros roles
(owner de academia, productor, instructor, admin) MUST NOT mostrarla
aunque la persona tenga una encuesta pendiente - su aviso viaja por la
notificación.

#### Scenario: Card visible tras el social

- **WHEN** un asistente abre `/inicio` con la lente bailarín en modo
  Social dentro de la ventana sin haber evaluado
- **THEN** ve la card que lleva a la encuesta del evento

#### Scenario: Sin card tras evaluar o expirada

- **WHEN** el asistente ya evaluó o pasaron >24h
- **THEN** la card no aparece

#### Scenario: Owner de academia con encuesta pendiente

- **GIVEN** un usuario con rol ACADEMY_OWNER que asistió a un social y
  tiene la encuesta pendiente
- **WHEN** abre el inicio de su consola de academia
- **THEN** no ve la card "¿Cómo estuvo ...?" (su pendiente sigue en
  notificaciones y aparece al cambiar a la lente bailarín, modo Social)

#### Scenario: Card fuera del apartado Social

- **GIVEN** un bailarín con encuesta de social pendiente
- **WHEN** abre `/inicio` con la lente bailarín en modo Academia
- **THEN** la card de social no aparece en ese apartado
