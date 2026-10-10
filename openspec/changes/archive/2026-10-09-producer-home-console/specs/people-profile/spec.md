# people-profile Delta

## ADDED Requirements

### Requirement: Perfil simplificado del productor

La lente PRODUCER SHALL ocultar en `/perfil` la racha ("Semanas
seguidas"), las insignias y el enlace "Mis pagos" - su actividad y su
dinero viven en su consola, no en el perfil de consumo.

#### Scenario: productor en su perfil

- WHEN una persona con lente PRODUCER abre /perfil
- THEN no se muestran la sección de racha, la de insignias ni la card
  "Mis pagos"; el resto del perfil (datos, roles, "Interactuar como",
  sesiones) queda igual
