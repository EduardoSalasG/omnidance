# academies/payment-claims — delta pilot-real-users

## MODIFIED Requirements

### Requirement: Medio de pago elegido en el checkout

La selección de medio de pago de la academia (métodos propios vs
pasarela Flow) SHALL ocurrir dentro de `/academias/:id/checkout`, no en
la ficha pública, y el panel SHALL renderizarse siempre — aunque la
academia no tenga métodos propios activos — mostrando la pasarela como
única opción marcada. Cuando el método elegido es TRANSFER, el checkout
SHALL mostrar los campos `holder` (nombre), `rut`, `bank`,
`accountType`, `accountNumber` y `email` del método con copia
individual y una acción "copiar todos" que produce un bloque de texto
pegable en apps de banco. La ficha pública SHALL mantener solo la lista
read-only de los claims propios del alumno (estado, monto, motivo de
rechazo).

#### Scenario: datos bancarios copiables

- **WHEN** el alumno confirma TRANSFER en el checkout
- **THEN** ve los seis campos etiquetados, cada uno copiable, y un
  botón que copia el bloque completo (incluido el monto)

#### Scenario: academia sin métodos propios

- **WHEN** el alumno abre el checkout de una academia sin métodos
  propios activos
- **THEN** el panel se muestra igualmente con la pasarela como única
  opción marcada — el alumno siempre ve con qué va a pagar
