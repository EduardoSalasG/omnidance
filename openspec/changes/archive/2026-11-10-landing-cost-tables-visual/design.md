# Design: landing-cost-tables-visual

## Decisiones

- **Cards, no tabla**: los métodos de cobro/venta son 2-3 opciones que
  se comparan de un vistazo; una card por método con el costo en grande
  (jerarquía: costo primario → método → quién hace el trabajo) escanea
  mejor que filas de tabla y respeta la regla de 3 niveles de
  ui-ux-principles.
- **`costNote` separado del monto**: "$119 + tu pasarela" mezcla cifra y
  condición en un mismo peso. El split deja la cifra grande
  (`text-2xl tabular-nums text-neon`) y el sufijo como nota secundaria.
- **Pasos solo en academy**: el owner pidió el flujo alumno →
  plataforma → academia para esa sección. Producer no gana pasos: su
  argumento nuevo es la banda de fee por plan.
- **`planFees` estructurado, no string**: label + dos columnas
  (gestionada / métodos propios) por tier permite layout real y
  traducción limpia en los 4 locales.
- **La nota sigue siendo letra chica**: lo que queda en `note`
  (facturación mes vencido / "el asistente paga el precio publicado")
  es letra chica legítima; solo sube lo persuasivo.

## Catálogo

`landingAcademy.costTable`:

```json
{
  "title": "Tu academia cobra sola",
  "lead": "…",
  "steps": [
    { "title": "Tu alumno paga", "desc": "…" },
    { "title": "La plataforma ordena", "desc": "…" },
    { "title": "La plata entra a ti", "desc": "…" }
  ],
  "rows": [
    { "method": "Comprobante (transferencia o efectivo)",
      "cost": "$0", "costNote": "de fee", "gain": "…" },
    { "method": "Tu pasarela (Flow o MercadoPago)",
      "cost": "$119", "costNote": "+ tu pasarela", "gain": "…" }
  ],
  "note": "…"
}
```

`landingProducer.costTable`: mismas `rows` (con `costNote` donde
aplique) +

```json
"planFees": {
  "label": "Con plan el fee baja",
  "managedLabel": "venta gestionada",
  "ownLabel": "métodos propios",
  "tiers": [
    { "name": "Standard", "managed": "~$736", "own": "~$417" },
    { "name": "Pro", "managed": "~$617", "own": "~$298" }
  ]
}
```

y `note` = "El asistente siempre paga el precio publicado."

## Componente (`Landing.tsx`)

El bloque `costTable` se re-renderiza así (mismo `section`/`aria`):

1. `h2` + `lead` (igual).
2. `steps` (si existe): `<ol>` de 3 pasos, `grid sm:grid-cols-3`, cada
   paso con índice neon (`01`) + título + desc; chevron de conexión
   `aria-hidden` entre pasos en `sm+`.
3. `rows` → `<ul>` de cards (`sm:grid-cols-2` si 2 filas,
   `sm:grid-cols-3` si 3): método `text-sm font-semibold`, costo
   `text-2xl font-extrabold tabular-nums text-neon` + `costNote`
   `text-xs text-ink/50`, gain `text-sm text-ink/60`.
4. `planFees` (si existe): banda `border-neon/40 bg-neon/5` con label
   semibold + por tier: nombre + dl gestionada/propios con montos
   `tabular-nums` en negrita.
5. `note` fine print (igual).

Tipo local `CostTableMessages` con `steps?`/`planFees?`/`costNote?`
opcionales (el catálogo de academy no declara `planFees` ni el de
producer `steps`). Se eliminan `colMethod`/`colCost`/`colGain` de los
4 catálogos.
