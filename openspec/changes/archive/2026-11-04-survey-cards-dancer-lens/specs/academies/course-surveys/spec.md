# Delta: academies/course-surveys

## ADDED Requirements

### Requirement: Card de encuesta pendiente solo en el apartado Academia

La card de encuesta mensual pendiente ("¿Cómo estuvo [serie]?") SHALL
mostrarse únicamente en el apartado **Academia** del inicio del
bailarín (`activeRole === "DANCER"` con `viewMode === "academy"`).
Las consolas de otros roles (owner, instructor, productor, admin)
MUST NOT mostrarla aunque la persona tenga una encuesta pendiente; la
notificación `academy.courseSurvey` sigue siendo el canal de aviso.

#### Scenario: Alumno en lente Academia

- **GIVEN** un alumno con encuesta de curso pendiente
- **WHEN** abre `/inicio` con la lente bailarín en modo Academia
- **THEN** ve la card que lleva a la encuesta de la serie

#### Scenario: Mismo alumno en lente Social

- **WHEN** el mismo alumno cambia el inicio a modo Social
- **THEN** la card de encuesta de curso no aparece

### Requirement: Notificación de encuesta de curso en la lente Academia

La notificación `academy.courseSurvey` SHALL clasificarse en la lente
`academy` (`NOTIFICATION_LENS_TYPES`): aparece en /notificaciones y en
el badge no leído solo cuando la lente activa es Academia, igual que
las demás notificaciones de dominio academia.

#### Scenario: Badge por lente

- **GIVEN** un alumno con una notificación `academy.courseSurvey` no
  leída
- **WHEN** alterna entre las lentes Social y Academia
- **THEN** la cuenta y la lista la muestran solo en Academia
