## ADDED Requirements

### Requirement: Breakdown del score en la ficha del contacto

`GET /crm/people/:personId` SHALL incluir `breakdown` (el Json de
`RelationshipScore.breakdown`, null si no existe). La UI de la ficha del
contacto SHALL mostrar el desglose de componentes cuando
`breakdown != null` y solo número + segmento cuando es null.

#### Scenario: contacto recomputado con fórmula nueva

- **GIVEN** un contacto con `breakdown` poblado
- **WHEN** el actor abre su ficha en `/crm/personas/[id]`
- **THEN** ve el desglose por componente bajo el score
