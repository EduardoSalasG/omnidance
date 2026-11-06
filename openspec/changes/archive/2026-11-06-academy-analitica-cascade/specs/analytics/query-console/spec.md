## ADDED Requirements

### Requirement: Selects FK en cascada

Los filtros FK de una entidad SHALL declarar sus dependencias de
opciones en `FilterDef.dependsOn`. Cuando un filtro padre cambia, la
barra de filtros SHALL re-pedir `/query/options` pasando los valores
actuales de los padres y SHALL limpiar la selección de los filtros
dependientes (en cadena transitiva). Sin padre elegido, las opciones
son las del scope completo.

En `attendance` (lente ACADEMY_OWNER) el orden y las dependencias son:
nivel (`levelId`) → serie (`seriesId` depende de levelId) → horario
(`slotId` depende de seriesId) → clase (`classId` depende de slotId);
instructor (`instructorId` depende de slotId y ofrece solo el
instructor del horario elegido).

#### Scenario: nivel acota el select de serie

- **GIVEN** un owner en la entidad `attendance` con un nivel elegido
- **WHEN** abre el select de serie
- **THEN** solo ve las series de ese nivel

#### Scenario: serie acota horario, horario acota clase e instructor

- **GIVEN** una serie elegida
- **WHEN** abre el select de horario
- **THEN** solo ve los horarios de esa serie
- **AND** con un horario elegido, el select de clase solo ofrece las
  ocurrencias de ese horario y el de instructor solo el instructor del
  slot

#### Scenario: cambiar el padre limpia dependientes

- **WHEN** el usuario cambia el nivel tras haber elegido serie,
  horario y clase
- **THEN** serie, horario y clase vuelven a "Todos" (su selección
  anterior era potencialmente inválida)
