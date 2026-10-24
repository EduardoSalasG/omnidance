# academy-console Specification

## Purpose
TBD - created by archiving change academy-tier-v2. Update Purpose after archive.

## Requirements

### Requirement: Gating fino de features en superficies compartidas

El sistema SHALL ocultar (no solo bloquear) campos/secciones según
features del tier: score y clasificación CRM requieren `crm`;
asistencia en detalle de alumno requiere `attendance`; insights de
audiencia en home requieren `insights`; "clases de hoy" requiere
`classes`; consultas rápidas requieren `analytics`; crear academia
requiere `multiAcademy` (también server-side en POST /academies).

#### Scenario: COBROS sin leak en card de alumno

- **GIVEN** academia COBROS **WHEN** abre /academia/alumnos **THEN**
  las cards no muestran score ni clasificación CRM; el detalle no
  muestra asistencia; el home no muestra insight de audiencia ni
  clases de hoy

#### Scenario: Crear academia solo en tier PRO

- **GIVEN** academia STUDIO **WHEN** intenta POST /academies o abre
  /academia/nueva **THEN** la API responde 403 tier.required y el CTA
  no se muestra

### Requirement: Reporte de cobranza de academia

El sistema SHALL ofrecer a cualquier tier un reporte mensual:
facturación del mes, alumnos que pagaron, plan más vendido y filtros
por período/plan/estado.

#### Scenario: COBROS ve su facturación

- **GIVEN** academia COBROS con cobros del mes **WHEN** abre el
  reporte **THEN** ve total facturado, lista de pagantes, plan top y
  filtros funcionales
