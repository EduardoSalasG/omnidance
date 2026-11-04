# Delta: academies/course-surveys

## ADDED Requirements

### Requirement: Resultados por instructor acotados

`GET /academies/:id/instructors/:personId/surveys` SHALL acotar su
respuesta: los comentarios por grupo (mes×serie) se capan server-side
(p.ej. 50 por grupo) y el endpoint acepta un parámetro `limit` de
grupos con default acotado, para que un profesor con años de historia
no devuelva un payload no acotado. La ficha del profesor renderiza
preview + "Ver todo" sobre los grupos y sobre los comentarios de cada
grupo.

#### Scenario: historial largo de encuestas

- **GIVEN** un profesor con 40 grupos mes×serie y 80 comentarios en
  uno
- **WHEN** el owner abre su ficha
- **THEN** la sección muestra el preview expandible y el backend nunca
  devuelve más del cap de comentarios por grupo
