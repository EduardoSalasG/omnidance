# rbac Specification Delta

## ADDED Requirements

### Requirement: checklist de validación visible al actor PENDING

`GET /me/role-checks` SHALL devolver, por cada PersonRole PENDING de un
rol de validación (ACADEMY_OWNER/PRODUCER), el mismo checklist que
evalúa la cola admin (nombre real, email verificado, teléfono, datos
del actor: academia o evento creado) y si está completo. La app SHALL
mostrar una card al actor con los ítems faltantes, cada uno enlazado a
la acción que lo resuelve (perfil/datos, consola del actor, verificación
de correo inline) — el actor nunca ve "En revisión" sin saber qué falta.

#### Scenario: owner ve lo que le falta

- **WHEN** un ACADEMY_OWNER PENDING sin teléfono ni correo verificado
  abre su perfil o su home
- **THEN** la card lista "email verificado" (con CTA de verificación
  inline), "teléfono" (link a /perfil/datos) y "datos del actor"
  (link a /academia)

#### Scenario: checklist completo queda a la espera del admin

- **WHEN** todos los checks del rol PENDING pasan
- **THEN** la card indica que el perfil está completo y en espera de
  aprobación — sin ítems accionables

#### Scenario: sin roles pendientes no hay card

- **WHEN** la persona no tiene PersonRole PENDING de validación
- **THEN** la card no se renderiza
