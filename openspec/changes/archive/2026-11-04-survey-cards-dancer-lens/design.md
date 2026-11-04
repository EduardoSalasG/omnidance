# Design: survey-cards-dancer-lens

## Decisión

Cambio puramente de gateo en `HomeHub.tsx` (~líneas 675-715). Hoy la
`<section>` de encuestas se renderiza sobre el contenido de lente para
cualquier rol. Se divide en dos listas gateadas por la lente bailarín:

- `surveys` (post-social, `/me/pending-surveys`) → solo si
  `dancerSocial` (`activeRole === "DANCER" && viewMode === "social"`).
- `courseSurveys` (mensual, `/me/pending-course-surveys`) → solo si
  `dancerAcademy` (`activeRole === "DANCER" && viewMode === "academy"`).

Ambas variables ya existen en el componente (`dancerAcademy` ~línea
430, `dancerSocial` ~línea 627). Como el viewMode es excluyente, nunca
se muestran las dos listas a la vez; la `<section>` solo se monta si
la lista del modo activo trae items (misma regla de cero-hueco
actual).

Los fetches `/me/pending-*` se conservan tal cual (una vez por sesión,
paralelo a `/me`): son baratos y no hay que re-trigger por lente -
filtrar en render es suficiente.

## Fuera de alcance

- Las notificaciones in-app/push (`event.survey`,
  `academy.courseSurvey`) no cambian: son el canal de aviso y viven en
  /notificaciones para cualquier rol.
- La página `/notificaciones` y sus links a `/eventos/:id/evaluar` y
  `/academias/:id/encuesta` siguen disponibles para cualquier rol.
