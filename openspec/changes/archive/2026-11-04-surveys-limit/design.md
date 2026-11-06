# Design: surveys-limit

Cambio de una línea de contrato replicando el patrón ya probado del
endpoint hermano `instructorSurveys`.

- `courseSurveys` recibe `@Query("limit") limit?: string` y aplica
  `(await this.groupCourseSurveys(surveys)).slice(0, groupLimit)` con
  `groupLimit = Math.min(Math.max(Number(limit) || 12, 1), 60)`, la
  misma expresión de `instructorSurveys` (factorizar el helper no
  aporta: son 2 llamadas en el mismo controller).
- `@ApiQuery({ name: "limit", required: false })` para que el schema
  Swagger quede sincronizado.
- El cap va sobre los grupos devueltos por `groupCourseSurveys`
  (post-agregación), no sobre el `findMany` de respuestas crudas: el
  contrato es "máximo N grupos mes × serie".
- Sin paginación: el front pide 60 y recorta client-side si hace
  falta; inventar cursor/page para un listado acotado por defecto es
  sobre-ingeniería.

Riesgos: ninguno contractual para el front (ya manda `limit=60`). Un
consumidor sin `limit` pasa de "todos los grupos" a "12 más
recientes" - mismo comportamiento que el endpoint hermano y coherente
con el cap de la ficha.
