# Delta: academies/class-levels

## ADDED Requirements

### Requirement: Ubicación del mantenedor en Configuración

El mantenedor de la línea de niveles SHALL vivir en la sección
Configuración de la consola de academia
(`/academia/configuracion/niveles`), no entre los módulos operativos
del drawer: es una configuración de una vez, al mismo nivel que los
valores por defecto de clases, los métodos de pago o el perfil
público. El item del drawer SHALL listarse dentro del grupo
`navGroups.config` y conservar el gate `academyFeature: "classes"`.
La ruta anterior `/academia/niveles` SHALL redirigir a la nueva para
no romper deep-links existentes.

#### Scenario: Drawer de la consola owner

- **WHEN** el owner abre el drawer de su consola
- **THEN** "Niveles" aparece dentro del grupo Configuración y ya no en
  el grupo Enseñanza

#### Scenario: Deep-link viejo

- **WHEN** se navega a `/academia/niveles`
- **THEN** se redirige a `/academia/configuracion/niveles` y el
  mantenedor funciona igual
