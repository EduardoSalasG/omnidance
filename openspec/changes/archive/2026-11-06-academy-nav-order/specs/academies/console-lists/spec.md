## ADDED Requirements

### Requirement: Orden de secciones del drawer del owner

El drawer de la lente ACADEMY_OWNER SHALL ordenar sus secciones de
operación antes que el setup: Enseñanza → Alumnos → Administración →
CRM → Analítica → Configuración.

#### Scenario: Analítica después de CRM, Configuración al final

- **WHEN** un Academy Owner abre el drawer en la lente ACADEMY_OWNER
- **THEN** la sección Analítica aparece inmediatamente después de CRM
- **AND** la sección Configuración es la última del drawer
