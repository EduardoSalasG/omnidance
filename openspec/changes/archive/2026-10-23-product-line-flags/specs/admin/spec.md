# Delta: admin (product-line-flags)

## ADDED Requirements

### Requirement: Flags de línea de producto

El catálogo SHALL incluir `social_line` y `academy_line` (default ON).
Con `social_line:false` el front SHALL ocultar tabs e ítems sociales
del bailarín (eventos, bailes, prácticas); con `academy_line:false`
oculta los de academia (clases, directorio). Roles internos (admin)
y páginas de consola del actor no se gatean.

#### Scenario: Operación solo-academias

- **WHEN** admin apaga `social_line`
- **THEN** el bailarín no ve Eventos/Bailes/Prácticas en tab bar, sheet
  ni sidebar; su lente usable es academia
