## ADDED Requirements

### Requirement: Detalle de miembro de equipo y profesor

Las cards de equipo navegan a páginas de detalle en vez de exponer
acciones inline:

- Colaborador → `/academia/equipo/miembro/[personId]`: datos de contacto,
  rol, permisos vigentes y enlace a edición de permisos (nivel 3).
- Profesor → `/academia/equipo/profesor/[personId]`: datos de contacto,
  acuerdo económico, estadísticas (clases impartidas total/mes,
  asistencias del mes), próximas clases y enlace a edición del acuerdo.

#### Scenario: Owner edita permisos del colaborador

- **WHEN** PATCH `/academies/:id/staff/:personId` con `permissions[]`
- **THEN** el set de permisos se reemplaza y responde el miembro
  actualizado

### Requirement: Acuerdo económico del profesor

La relación económica con el profesor SHALL configurarse al crear/editar
el profesor (desde Equipo), con dos modalidades: `PER_CLASS` (pago por
clase) o `MONTHLY` (mensual por una cantidad de clases pactada). Campos:
`payType`, `payAmount`, `payClasses` (obligatorio en MONTHLY). La
comisión porcentual `commissionPct` queda legacy/deprecada y no se usa
en la UI.

#### Scenario: Profesor a mensualidad

- **WHEN** POST/PATCH instructor con `payType=MONTHLY`,
  `payAmount=400000`, `payClasses=20`
- **THEN** se persiste el acuerdo y el detalle muestra "$400.000/mes por
  20 clases"

#### Scenario: Profesor por clase

- **WHEN** `payType=PER_CLASS` con `payAmount=15000`
- **THEN** `payClasses` se ignora/limpia y el detalle muestra
  "$15.000 por clase"
