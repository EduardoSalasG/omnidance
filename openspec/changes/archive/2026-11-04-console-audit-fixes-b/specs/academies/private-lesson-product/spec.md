## ADDED Requirements

### Requirement: Listado de particulares scopeado al instructor puro

`GET /academies/:id/private-lessons` SHALL devolver solo las lecciones
con `instructorId` del caller cuando este es instructor puro de la
academia (registro `AcademyInstructor` sin `AcademyStaff`, sin ser
owner ni ADMIN). Owner, ADMIN y staff con cap siguen viendo el listado
completo; el filtro explícito `instructorId` del query SHALL seguir
aplicándose para ellos.

#### Scenario: Instructor puro ve solo las suyas

- **GIVEN** un instructor puro de la academia con lecciones asignadas
  a él y a otros instructores
- **WHEN** pide `GET /academies/:id/private-lessons`
- **THEN** `items` solo contiene las lecciones donde
  `instructorId = me` y `total` refleja ese universo

#### Scenario: Staff con cap ve el listado completo

- **WHEN** un staff con cap `schedule` pide el listado sin
  `instructorId`
- **THEN** recibe todas las particulares de la academia
