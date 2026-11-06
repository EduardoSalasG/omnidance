## MODIFIED Requirements

### Requirement: Selects FK en cascada

Los filtros FK de una entidad SHALL declarar sus dependencias de
opciones en `FilterDef.dependsOn`. La cascada es acumulativa: las
opciones respetan TODOS los filtros padre elegidos aunque haya niveles
intermedios sin selección. Cuando un filtro padre cambia, la barra de
filtros SHALL re-pedir `/query/options` con los valores actuales de
los padres y SHALL limpiar la selección de los dependientes en cadena
transitiva. Sin padre elegido, las opciones son las del scope
completo.

En `attendance` (lente ACADEMY_OWNER) el orden es nivel → serie →
horario, con instructor acotado por serie y por horario. No hay select
de clase: la ocurrencia concreta se alcanza con horario + rango de
fechas.

#### Scenario: nivel acota el select de serie

- **GIVEN** un owner en la entidad `attendance` con un nivel elegido
- **WHEN** abre el select de serie
- **THEN** solo ve las series de ese nivel

#### Scenario: nivel acota horario sin serie elegida

- **GIVEN** un nivel elegido y el select de serie en "Todos"
- **WHEN** abre el select de horario
- **THEN** solo ve los horarios de las series de ese nivel

#### Scenario: serie acota horario, horario acota clase e instructor

- **GIVEN** una serie elegida
- **WHEN** abre el select de horario
- **THEN** solo ve los horarios de esa serie
- **AND** con un horario elegido, el de instructor solo ofrece el
  instructor del slot

#### Scenario: serie sin horario acota instructor

- **GIVEN** una serie elegida y el select de horario en "Todos"
- **WHEN** abre el select de instructor
- **THEN** ofrece solo el instructor titular de la serie

#### Scenario: cambiar el padre limpia dependientes

- **WHEN** el usuario cambia el nivel tras haber elegido serie y
  horario
- **THEN** serie y horario vuelven a "Todos"
