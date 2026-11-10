# Delta: console-crud-flows (producer-console-cta-dedup)

## MODIFIED Requirements

### Requirement: Estado vacío con CTA

En un listado gestionable SHALL existir exactamente un CTA de crear:
el del header de la pantalla o de la sección que lista la entidad. El
estado vacío SHALL mostrar solo el mensaje (sin repetir el botón de
crear en ninguna variante), salvo cuando la superficie no tiene CTA
de crear propio (ej. el dashboard del productor sin actividad, donde
el CTA de primer evento es la acción del estado vacío).

#### Scenario: Lista vacía

- **WHEN** el listado no tiene entidades y el header de la pantalla o
  de la sección ya muestra el botón de crear
- **THEN** el empty state muestra el mensaje y NO repite el botón de
  crear

#### Scenario: preventa por academias vacía en la ficha del evento

- **GIVEN** un evento del productor sin acuerdos de preventa
- **WHEN** el productor abre su ficha
- **THEN** la sección "Preventa por academias" muestra el mensaje
  vacío y el único CTA `＋ Invitar` es el del header de la sección

#### Scenario: medios de cobro vacíos

- **GIVEN** un productor sin métodos propios ni pasarela
- **WHEN** abre `/productor/medios-pago`
- **THEN** el empty state muestra el mensaje y el único CTA "Agregar
  método" es el del header de la card

#### Scenario: dashboard sin actividad

- **GIVEN** un productor aprobado sin eventos
- **WHEN** abre `/inicio` en su lente
- **THEN** el dashboard muestra el CTA de crear su primer evento (la
  superficie no tiene CTA de crear propio)
