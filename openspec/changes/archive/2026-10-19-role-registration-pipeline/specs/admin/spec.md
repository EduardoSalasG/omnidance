# admin; delta role-registration-pipeline

## ADDED Requirements

### Requirement: cola de validación de perfiles

`/admin/perfiles-por-validar` SHALL listar PersonRole PENDING de
ACADEMY_OWNER/PRODUCER con el checklist de perfil (nombre, email
verificado, teléfono, datos del actor completados). Aprobar SHALL
exigir el checklist completo (409 si falta algo) y pasar el rol a
APPROVED; rechazar SHALL retirar el rol.

#### Scenario: aprobar perfil completo

- **WHEN** admin abre la cola y un owner tiene todos los datos
- **THEN** el botón Aprobar está habilitado; al aprobar el rol pasa a
  APPROVED y su academia/eventos quedan visibles

#### Scenario: perfil incompleto no aprueba

- **WHEN** un productor PENDING no tiene teléfono ni datos de actor
- **THEN** Aprobar está deshabilitado con el checklist marcando lo
  faltante; forzar el endpoint responde 409
