# Estrategia comercial y de producto — 2026-10-22

Hallazgos y decisiones de la revisión de proyección/pricing de la
sesión del 22-oct. Lo vinculante para producto vive en `omni-dance.md`
§10 (tabla de tiers, proyección por escenario, comparativa de
pasarelas). Este documento guarda el *razonamiento* detrás de los
números y lo que falta validar.

## 1. Arquitectura de tiers — señuelo + medio + top

Decisión de empaquetado (aplicada a academia y producer): 3 niveles
donde el más barato es **señuelo deliberado** — existe para anclar,
no para venderse. El plan objetivo es el medio; el top captura a las
operaciones grandes.

- **Academia**: Starter $39.500 (≤60) → Studio $79.700 (≤150) → Pro
  $120.500 (ilimitado). Feature-gating: Starter solo cobranza + estado
  de alumnos (con take ~4,8% all-in sobre lo recaudado — ahí la
  cobranza ES el producto, compite con Membrezia); Studio operación
  completa; Pro = CRM/analítica/campañas/videos/multi-academia.
  Enterprise queda fuera de la landing (a convenir, sin self-serve).
- **Producer Pro**: Starter $79.700 (≤$2,5M fact. media 90d) →
  Standard $169.500 (≤$8M) → Pro $300.200 (>$8M) — los 3 tiers son
  pagos y self-serve. Ticketing base nunca se corta — es el funnel
  del marketplace.
- **Nomenclatura** (2026-10-28): los nombres visibles son
  `TierPrice.displayName` / catálogo i18n; los códigos persistidos
  (`COBROS`, `PRO_STARTER`…) no se renombran — desacople deliberado
  para futuros renames sin migración.
- **Error evitado**: la escalera propuesta inicialmente (40/65/90)
  tenía el salto medio→top más chico que señuelo→medio → todo el
  mundo habría saltado al top. Ratios sanos: medio ≈ 1,7–2× señuelo,
  top ≈ 1,3–1,5× medio.
- **Descuentos por ciclo**: se corrigió −2%/−4% a **−8% semestral /
  −15% anual** (convención 15–20%; el descuento anterior no movía
  ninguna decisión).
- **Cap de volumen** (alumnos / facturación) quedó como límite
  operativo, no como eje de precio — escala con la capacidad de pago
  y empuja el upgrade sin vender cuentas nuevas.
- Notificaciones transaccionales (recordatorio de clase, renovación,
  waitlist) viven en TODOS los tiers — son función core; solo el
  marketing segmentado se gatea a PRO.

## 2. Estado real del gating por suscripción (al 22-oct)

- Producer: existe `assertProducerPro` pero **binario** (Pro sí/no),
  con 403 `pro.required` + CTA upgrade. Falta gating por nivel.
- Academia: **no había gating por tier** — el tier solo fijaba precio.
  El change `academy-tier-cobros` (en curso) construye la matriz de
  entitlements reutilizando el patrón producer-pro.
- Dancer: el Pase Social ya tiene gating por estado de suscripción
  (créditos/beneficios). No necesita tiers — es binario y basta.

## 3. Publicidad segmentada a bailarines (línea nueva evaluada)

- Producto: pushes/notificaciones in-app promocionando talleres y
  eventos, cupos incluidos en tiers top + extras ~$12.500/campaña.
- **El cap de inventario es feature, no bug**: máx. 1 push
  promocional/semana/persona → escasez que protege el tono y sostiene
  el precio. Guardrails: opt-out, targeting por agregados (nunca data
  individual — regla de privacidad de scores), cola de aprobación
  admin en v1.
- Estimación: $0,02M / $0,15M / $0,45M mensual por escenario —
  modesta como línea, pero con efecto multiplicador: cada campaña
  levanta GMV de ticketing.
- Riesgo si se afloja el cap: degrada a spam y erosiona la confianza
  del canal de notificaciones (que también lleva transaccionales
  críticas: QR, check-in, renovaciones).

## 4. Pase Social — unit economics y supuestos críticos

- Ingreso $15.000/mes − pasarela ~3,2% − reembolso productor por
  crédito canjeado (supuesto $2.500 × 4 × 75% redención) → margen
  **~$7k/suscriptor/mes (~47%)**.
- **Supuesto más sensible**: la tarifa de reembolso por crédito. Cada
  $500 de tarifa mueve ~$1,4k el margen por suscriptor. Sigue sin
  definir — decisión pendiente (fijo vs % del ticket).
- Segundo supuesto frágil: "suscriptor siempre paga preventa" solo
  vale si los productores mantienen puerta > preventa; si el gap se
  cierra cae el valor percibido.
- En captura (~350 suscriptores ≈ 20% de activos) es la línea de
  margen más grande del modelo: ~$2,45M/mes — más que cualquier línea
  SaaS individual.

## 5. Fintoc — evaluación completa de productos

Fintoc ya no es solo débito A2A: es gateway completo.

| Producto Fintoc | Qué aporta a omni | Prioridad |
|---|---|---|
| Payment Initiation (A2A) | ~1,35%+IVA vs ~3,19% de Flow → neto/ticket +28–38% | **Alta**: checkout CL |
| Smart Checkout (tarjetas + Apple/Google Pay + orquestación) | Routing por tasa de éxito; fallback de tarjeta sin segunda integración | Media |
| Payouts API | El `PayoutRail` chileno pendiente — cierra el desembolso automático | **Alta** |
| Suscripciones por débito directo | Billing SaaS/pase a ~1% vs ~3% tarjeta | Media |
| Webhooks verificados contra API | Sin secret que rotar — menos superficie | — |

Pegas honestas: primera autorización bancaria pide credenciales
(fricción vs tarjeta guardada); cobertura bancaria a medir
(BancoEstado importa en esta escena); las cuotas de crédito no le
importan al bailarín (tickets chicos) pero SÍ a academia/productor
(pagan $40–300k) → **Flow queda como rail de billing y fallback**.

## 6. Mapa de monetización (4 modelos híbridos)

1. **Marketplace fee** — ticketing 8–10% al productor. Riesgo:
   cold-start → mitigado con check-in universal (cada evento captura
   bailarines).
2. **SaaS** — academias + Producer Pro. Riesgo: churn → trial +
   gracia 5d ya diseñados.
3. **Suscripción + liability de redención** — Pase Social. Riesgo:
   redención > supuesto → cap de canje por evento + piloto con 1
   productor.
4. **Usage/cobranza** — take ~4,8% solo en tier COBROS academia.

## 7. Experimentos de validación pendientes

1. Precios academia: mostrar la tabla a 3 academias reales sin guía —
   si alguien elige COBROS de verdad, el corte del señuelo está mal.
2. Pase Social: landing `/pase` con flag OFF → prender como lista de
   espera con precio; medir conversión antes de construir reembolsos.
3. Producer Pro: ofrecer a los productores del piloto con trial 90d —
   ver quién paga al expirar.
4. Tarifa de reembolso de crédito: negociarla con 2 productores reales
   antes de fijar el precio del pase.
5. CAC por actor: no hay instrumentación — mínimo viable: registrar
   fuente de adquisición en el alta.

## 8. Debilidades del modelo → plan de ataque

Las tres debilidades quedaron corregidas en el modelo (fila "Tracción
estresada" + métricas `Concentración top-1` y `Expansión de tier` en
§10). Las acciones que las mitigan:

### a) Churn no modelado → instrumentación + retención

- **Medir desde el día 1**: NRR y cohortes por actor en
  /admin/finanzas (tab SaaS ya muestra funnel; falta retención por
  cohorte). Dunning ya existe (gracia 5d + jobs de recordatorio).
- **El anual a −15% es el seguro anti-churn**: empujar anualidad en el
  pricing congela 12 meses de MRR y sube el switching cost real.
- **Winback**: campaña automática a los 30d de baja (la audiencia de
  ciclo de vida de /admin/campanas ya soporta esto).
- Regla de decisión: si churn >5%/mes sostenido → pausar expansión,
  entrevistar bajas, arreglar la causa antes de seguir vendiendo.

### b) Concentración del Piloto (1 productor ≈ 50%)

- **Redefinir el piloto**: no se declara exitoso con 1 productor —
  objetivo mínimo 3 productores activos antes de escalar claims.
- **Alerta operativa**: `Concentración top-1` >40% visible en
  /admin/finanzas → dispara pipeline de respaldo (lista de productores
  candidatos por ciudad).
- **Contratos**: ninguna exclusividad ni custom-build para el primer
  productor que lo haga irreemplazable.
- Diversificar el tipo de oferta temprano (socials + academias +
  prácticas) para que ningún evento único concentre GMV.

### c) Expansión de tier no modelada (upside)

- **Upgrade prompts in-product**: al 80% del cap (alumnos o
  facturación 90d) → aviso en consola + email "estás por quedar
  grande en tu plan". El upgrade deja de depender de ventas humanas.
- Revisión mensual de cuentas cerca del cap en /admin/finanzas (lista
  "por crecer de tier").
- En proyección se mantiene fuera de los números (es upside, no
  baseline) pero se mide como métrica propia.

### d) Riesgo residual sin mitigación técnica

- Tarifa de reembolso del Pase Social: sin fijar — bloquea el precio
  público del pase hasta negociarla con 2 productores reales.
- Conversión A2A de Fintoc: si <30% de los checkouts la elige tras el
  piloto, la tesis de margen por pasarela se revisa.

## 4. Comisión, IVA y promo de lanzamiento (pitch cold closer)

Decisión 2026-10-28 — estructura de comisión al productor y la oferta
de captura. Lo vinculante queda en `omni-dance.md` §10 y en los params;
aquí el razonamiento y el script.

### La estructura: 5% + IVA + pasarela

- **Fee plataforma: 5% + IVA** por venta gestionada (`fees.*`), más
  **pasarela como passthrough real** (~3,19% tarjeta, ya con su IVA —
  no se le suma IVA encima, es costo del banco).
- Total all-in ≈ **9,1%**. El comprador paga el precio publicado
  exacto; la comisión se descuenta de la liquidación del productor.
- La desagregación es también la estrategia defensiva: el passthrough
  transparente impide leer el 9,1% como "codicia de la plataforma" y
  deja tu fee visible como lo que es (~5-5,7% neto).

### La escena real: 50% formal / 50% informal

| Productor | Cuenta | Recupera IVA |
|---|---|---|
| Ardilla, Bsoul (SpA), Bailemos (SpA), C2 Carlos Producciones | Empresa | Sí — su costo real baja |
| Ashé, Madness, La Gozadera, Havana | Personal | No |

Eso define la tabla de costo real que el closer debe memorizar:

| Escenario | Informal (IVA es costo puro) | Formal (IVA = crédito) |
|---|---|---|
| BYO-link propio (SumUp/MP ~3,8%+IVA) | ~4,5% + trabajo manual + fraude | ~3,8% |
| Promo meses 1-6 (fee −50%) | ~6,2% | ~5,2% |
| Promo meses 7-12 (fee −25%) | ~7,7% | ~6,4% |
| Full | ~9,1% | ~7,6% |

**La línea clave del pitch**: durante la promo la prima del loop
gestionado sobre el BYO-link es ~1,7pts — menos que lo que hoy pierden
en comprobantes falsos, filas en la puerta y planillas de
reconciliación. Post-promo la prima sube a ~4,6pts y ahí vendes
hábito, data y puerta QR, no precio.

### Promo de lanzamiento escalonada

- **Meses 1-6: −50% del fee de plataforma** (5%→2,5%+IVA) **y de los
  planes** (Starter productor ~$39.850, academias similar).
- **Meses 7-12: −25%** del fee y de planes.
- **Solo sobre el fee propio — la pasarela nunca se subsidia** (ese
  descuento sería pérdida seca de caja).
- Mecanismo existente: `PlatformPromo` (PERCENT, maxCycles, ventana,
  whitelist, scope) genera plan espejo sin mutar el tier — nunca
  mostrar el precio promo como "el precio"; siempre tachado +
  oferta + vencimiento.
- El BYO-link se autolimita: vender 150 entradas por link externo y
  validarlas a mano es justo el dolor que la plataforma elimina; la
  emisión de ticket online solo nace de orden gestionada (invariante
  de producto — nunca "sube tu link de pago").

### Proyección 3 años (referencia, CLP)

~$12M año 1 (promo + rampa 40%) → ~$47M año 2 (~80% cobertura, full)
→ ~$64M año 3 (monopolio ~95%). El subsidio año 1 ≈ $10M de revenue
diferido = costo de captura de la cartelera completa. Upside mayor:
si la puerta también se digitaliza, el pool de comisión casi se
duplica (+~$20M/año).

### FAQ cold closer

**"La transferencia me sale gratis, ¿por qué te pagaría?"**
No es gratis: te cuesta la fila en la puerta, los comprobantes falsos,
la conciliación post-evento y que no sabes quién es tu público. Con
promo pagas ~6% total por vender online con cero trabajo y te llevas
la data — lo que hoy pierdes en fugas paga la prima solo.

**"¿Y si uso mi propio link de MercadoPago/SumUp?"**
Puedes — pero el link te cobra, no te da la entrada. El QR, el
check-in en segundos, la liquidación del evento y el CRM de tu
público nacen de la venta gestionada. Con link propio igual terminas
validando a mano en la puerta.

**"Soy empresa, ¿el IVA me sirve?"**
Sí — te emitimos el documento y el IVA del fee te vuelve como
crédito: tu costo real baja ~1,5pts bajo el número de lista (ej.
~7,6% en vez de 9,1%).

**"¿Qué pasa después de la promo?"**
El precio de lista siempre estuvo visible (con el tachado desde el
día uno) y el descuento se reduce por tramos: −50% seis meses, −25%
seis más, full al año. Nunca una sorpresa de un día para otro.

**"¿El asistente paga más caro online?"**
No — paga el precio publicado exacto, sin cargo de servicio al
comprador. La comisión la absorbe el productor de su recaudación,
como cualquier costo de operación.

**"¿Me encierro contigo?"**
La suscripción es mensual/semestral/anual, cancelable; lo que te
queda al irte es tu data exportada (en planes Standard+). Lo que te
ata no es un contrato, es que la alternativa es volver a las
planillas.

### El pitch en 4 movimientos

**Productor** (dolor → loop → promo → cierre):
1. *Dolor*: "¿Cómo cierras caja hoy? Excel + formularios +
   comprobantes falsos + fila en la puerta sin saber cuánto vendiste."
2. *Loop*: "Entradas al precio exacto, puerta QR que valida tu staff
   desde su teléfono, liquidación con números claros la misma noche."
3. *Oferta*: "Comisión 5%+IVA+pasarela; lanzamiento: −50% del fee tus
   primeros 6 meses, −25% los siguientes 6 — te sale menos que lo que
   hoy pierdes en fuga."
4. *Cierre*: "¿Cuál es tu próximo evento? Lo montamos esta semana."

**Academia** (dolor → orden → trial → cierre):
1. *Dolor*: "¿Cuánto tiempo llevas al día persiguiendo pagos por
   WhatsApp y marcando asistencia en papel?"
2. *Orden*: "Horarios publicados, alumnos que reservan y pagan solos,
   tú ves quién pagó y quién debe — sin un solo mensaje."
3. *Oferta*: "Empiezas con prueba nivel Studio — la operación
   completa desde el día uno; planes desde $39.500 y pagos
   semestral/anual con descuento."
4. *Cierre*: "¿Cuántos alumnos tienes hoy? La montamos esta semana."
