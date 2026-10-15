# crm/contact-console — delta crm-sidebar-section

## ADDED Requirements

### Requirement: Sección CRM en la navegación lateral

El drawer/sidebar de los roles con acceso al CRM SHALL listar el módulo
como sección propia "CRM" con un destino por superficie: Personas,
Segmentos, Campañas y Triggers.

#### Scenario: navegación directa

- **WHEN** el actor abre el drawer o mira la sidebar desktop
- **THEN** ve la sección CRM con sus 4 destinos y el activo refleja la
  sub-sección actual
