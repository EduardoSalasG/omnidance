# web-tag-manager Specification Delta — add-clarity

## ADDED Requirements

### Requirement: Microsoft Clarity bootstrap en el documento

Cuando `NEXT_PUBLIC_CLARITY_ID` está definido, TODA página HTML de la
web SHALL incluir el script bootstrap oficial de Microsoft Clarity en
`<head>`, que carga `https://www.clarity.ms/tag/<id>` con el id de
proyecto configurado. Cuando la variable no está definida, el bloque
MUST NOT renderizarse.

#### Scenario: ID configurado

- **GIVEN** `NEXT_PUBLIC_CLARITY_ID=z4swabie90`
- **WHEN** se sirve cualquier página de la app
- **THEN** el HTML contiene en `<head>` el bootstrap de Clarity que
  referencia `https://www.clarity.ms/tag/z4swabie90`.

#### Scenario: ID ausente

- **GIVEN** `NEXT_PUBLIC_CLARITY_ID` no está definido
- **WHEN** se sirve cualquier página
- **THEN** el HTML no contiene referencias a `clarity.ms`.

### Requirement: Permisos CSP para Microsoft Clarity

La política Content-Security-Policy de los documentos SHALL permitir
scripts desde `https://*.clarity.ms` (tag principal y recursos que el
propio tag inyecta desde subdominios), sin abrir otros orígenes.

#### Scenario: Documento con CSP

- **WHEN** se sirve cualquier documento HTML de la web
- **THEN** la CSP incluye `https://*.clarity.ms` en `script-src`.
