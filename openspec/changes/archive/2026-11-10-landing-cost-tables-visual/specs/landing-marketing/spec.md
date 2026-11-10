# Delta: landing-marketing (landing-cost-tables-visual)

## ADDED Requirements

### Requirement: Sección de comparación de costos visual

La sección "por cada $10.000" de las landings pro (`costTable` del
catálogo) SHALL presentarse como cards visuales por medio de cobro o
venta — una por fila del catálogo — con el costo como dato primario,
el método como label y "quién hace el trabajo" como texto secundario;
nunca como tabla de texto plano. En `/para-academias` la sección MUST
incluir además un flujo de pasos del dinero (el alumno paga → la
plataforma ordena → la academia recibe). En `/para-productores` la
baja de fee por plan MUST mostrarse como contenido destacado con los
montos por tier (gestionada y por métodos propios), no solo en la
nota al pie.

#### Scenario: Academia ve el flujo del dinero

- **WHEN** un visitante abre `/para-academias`
- **THEN** la sección "Tu academia cobra sola" muestra los pasos
  alumno → plataforma → academia seguidos de una card por medio de
  cobro con su costo destacado

#### Scenario: Productor ve el fee por plan

- **WHEN** un visitante abre `/para-productores`
- **THEN** la sección "Tu taquilla trabaja mientras produces" muestra
  una card por medio de venta y una banda destacada con el fee
  reducido de Standard y Pro por cada $10.000

#### Scenario: Fila nueva del catálogo sin cambio de código

- **WHEN** el catálogo `costTable.rows` gana o pierde una fila
- **THEN** la sección renderiza una card por fila sin tocar el
  componente
