# crm/contact-console; delta crm-dynamic-segments

## ADDED Requirements

### Requirement: Filtro por segmento guardado

El listado `/crm/personas` SHALL soportar filtrado por segmento
guardado además de segmento computado, tag y texto: el parámetro
`segmentId` restringe a miembros de `ActorSegmentMembership`. El
selector del UI SHALL ofrecer los segmentos guardados del actor junto
a los computados.

#### Scenario: filtro por segmento guardado

- **GIVEN** un segmento guardado "VIP" con 5 miembros
- **WHEN** el actor filtra el listado por "VIP"
- **THEN** solo ve esas 5 personas
