## ADDED Requirements

### Requirement: Export del reporte de cobros

`/academia/cobros/reporte` SHALL ofrecer export en CSV y PDF del
dataset filtrado actual, vía `GET /academies/:id/billing-report.csv`
y `.pdf` con los mismos filtros (from/to/planId/status) y `lang`
(es default, en soportado). El filename SHALL ser descriptivo:
`{reporte-cobros|billing-report}-{slug-academia}-{YYYY-MM-DD}.{ext}`.
El PDF SHALL usar la plantilla de marca: título, academia + período,
filtros aplicados, KPIs (Facturado, Alumnos, Métodos de pago) y la
tabla Fecha/Alumno/Plan/Método/Estado/Monto con valores localizados.

#### Scenario: export con filtros aplicados

- **WHEN** el owner filtra por un plan y rango de fechas y descarga
  el PDF
- **THEN** el archivo declara academia, período y filtros en la
  cabecera, KPIs resumidos y solo las filas del subconjunto

#### Scenario: idioma del usuario

- **WHEN** la app corre en `es-CL`
- **THEN** headers, estados, métodos, filename y formatos de
  fecha/moneda del export se generan en español (y `lang=en` produce
  su equivalente en inglés)

#### Scenario: marca heredada en todos los PDF

- **WHEN** se exporta cualquier PDF de la consola (cobros, analítica,
  eventos)
- **THEN** todos comparten la banda de marca, accent violeta y el
  pie con paginación
