---
name: mermaid-diagrams
description: Use when writing, editing, or debugging Mermaid diagrams (sequenceDiagram, flowchart, stateDiagram, classDiagram) in markdown docs — especially before claiming a diagram renders, or when one fails to display or throws a parse error.
---

# Mermaid diagrams

Guía de errores reales del repo (`docs/flows.md`, `docs/architecture.md`)
y la regla de oro: **un diagrama no está listo hasta que el parser lo
acepta**. El preview de GitHub/VSCode muestra solo una caja de error
sin decir la línea real: verificar siempre con el checker, no a ojo.

## Verificación obligatoria

```bash
node .devin/skills/mermaid-diagrams/scripts/check-mermaid.mjs docs/flows.md [más.md]
```

Corre `mermaid.parse` (mermaid 11 + jsdom, auto-instalado en
`%TEMP%/omnidance-mermaid-check` la 1ª vez, fuera del repo) sobre cada
bloque ```` ```mermaid ```` y reporta `OK`/`FAIL` con la línea del fence.
Después de crear o tocar cualquier diagrama: correrlo y llegar a
`0 con error` antes de declarar el trabajo hecho.

## Landmines verificados (sequenceDiagram)

Estos rompieron 15 de 42 diagramas reales; la causa dominante es el
punto y coma:

| Escribes | Resultado | Fix |
|---|---|---|
| `;` en texto de mensaje o nota | statement cortado → parse error en línea siguiente | `#59;` (entidad, renderiza `;`) o `·` |
| `&lt;` `&gt;` `&amp;` | contienen `;` → mismo error | `‹` `›` unicode o `#60;`/`#62;` |
| `alt`/`opt`/`loop`/`par`/`critical`/`rect`/`break` sin `end` | "Parse error" en EOF (línea fantasma) | contar aperturas = `end` |
| `"` dentro de label `A[...]`/`B{...}` (flowchart) | error `STR` | `A["..."]` + `#quot;` internas |
| `( )` en label sin comillas (flowchart) | parse error | `A["texto (con) paréntesis"]` |

Confirmado **seguro** en texto de mensajes/notas/condiciones: `?` `:` `/`
`{}` `()` `→` `·` `≥` `≤` `−` `ª` `!` `,` `<` `>` sueltos, `<br/>` para
wraps, `Note over A,B:` (participantes antes de `:`, texto después).

## Convenciones del repo

- Tipos en uso: `sequenceDiagram` (dominante), `flowchart TD/LR`,
  `stateDiagram-v2`.
- Estilo: texto en español, `<br/>` para wrap, participantes con alias
  (`participant API as CheckoutController`), comentarios de contexto en
  `Note over`.
- Puntuación de copy aplica también dentro de diagramas: sin `—`/`--`;
  ` - ` existe en diagramas viejos pero no agregar más (usar `:` o `·`).
- `docs/flows.md` agrupa por flujo de negocio con heading `##` + párrafo
  explicativo bajo el diagrama - mantener ese par.

## Errores frecuentes al diagnosticar

- **La línea del error NO es la línea rota**: `;` en la línea N hace
  fallar el parse con el cursor en N+1 o EOF. Buscar `;`/`&`/`"` en las
  líneas anteriores al offset reportado.
- **"Parse error on line N" es relativo al bloque**, no al archivo:
  la línea 1 es `sequenceDiagram`, no el fence ```mermaid.
- Probar líneas aisladas miente: `else`/`end`/`opt`/`alt` siempre
  fallan sueltas (necesitan su estructura). Descartarlas como falsos
  positivos y buscar el carácter ilegal en las demás.
