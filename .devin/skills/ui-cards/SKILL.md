# UI Cards — omnidance

Card 解剖學 — 承接 `ui-ux-principles` 的通用原則（先讀它），本 skill 只管
「卡片」這個元件型態。**兩個已驗證的 arquetipo，不是單一模板**：按使用者
在卡片前的任務選型。

## Arquetipo A — Card de lectura（查核／度量，例：Scores、academias）

使用者在**檢視一個實體的值**（score、balance、salud）：

```
[chip clasificación izq]        [chip clasificación der]   ← tag-row
Nombre de la entidad                      [VALOR grande]   ← headline
─────────────────────────────────────────────────────────  ← divider
+N componente      +N componente      +N componente        ← evidence
                                              🕐 fecha     ← footnote
```

1. **Tag-row**（分類，非內容）：回答「這是什麼類型」的 chips
   （`[Academia]`、`[Núcleo]`）放頂部，`justify-between` 錨邊。
   不和數據同列——分類不是測量。
2. **Headline**：identity（nombre，可截斷 `font-semibold`）對主值
   （metric/monto `text-2xl font-bold tabular-nums`），
   `flex items-baseline justify-between` 一列。
3. **Evidence**：值的「為什麼」——`border-t border-line pt-3` 隔開
   元件/stats。Divider 標出語意平面轉換，不是又一個普通 gap。
4. **Footnote**：可追溯性（creado/actualizado、id）右下，
   `text-[11px] text-ink/40`——不是決策資料。

En lista densa（una card por fila de academias）el headline baja a
`text-base`/`font-bold`——número gigante por fila = ruido.

## Arquetipo B — Card con rail de decisión（descubrimiento/acción）

Para escanear listas y decidir「¿entro / reservo?」（`EventCard`,
`ClassCard`）：contenido izquierda + **rail de decisión** derecho en
`flex-col items-center`:

```
Nombre                    │ 19:00        ← ancla de escaneo arriba
salsa · bachata [serie]   │ Preventa     ← label mutada
[Salsa] 📍 Venue          │ $10.000      ← decisión abajo
```

- **Ancla arriba del rail**: hora / estado — lo que se escanea primero.
- **Decisión abajo del rail**: `PriceTag` / "Gratis" / CTA `Reservar` /
  `statusBadge`. Misma posición = memoria muscular.
- **Card completo = Link** (`<Link className="block rounded-2xl">` +
  `hover:border-neon/50 active:scale-[0.99]`); nada interactivo anidado;
  CTA en el rail como sibling.
- **Mismo componente, contextos distintos**: el slot de acción cambia
  (CTA ↔ statusBadge), el shape no.

## Lecciones de iteración real

- **Clasificación arriba, datos abajo** — chips clasificatorios mezclados
  con datos fragmentan el escaneo.
- **Alineación por construcción** — nunca columnas `flex-col` con tamaños
  distintos; filas compartidas o `items-center` del padre por bloques.
- **Metadata como ícono** — "Actualizado el" → `🕐` (`ClockIcon`);
  verbos de trazabilidad → ícono, `sr-only` para el texto.
- **Borde nunca vacío** — dato nullable → chip neutro "Pendiente";
  el hueco rompe la simetría.
- **Unidad mutada** — `82 pts`, sufijo `text-xs text-ink/40`.
- **Título sin redundancia** — si los chips ya dicen la dimensión,
  el título no la repite.
- **Color por mapa fijo por enum** — `STATUS_VARIANT`-style, `?? "muted"`.
- **Comparativas fuera del chip** — `[Núcleo · 8] +2 (+33%)`: el delta
  va *al lado* del badge, con color verde/rojo/mutado, no adentro.
- **Itera viendo el render** — validar ópticamente en pantalla.
