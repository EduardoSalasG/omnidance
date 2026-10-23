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

- **Academia**: COBROS $39.990 (≤150) → STUDIO $79.990 (≤300) → PRO
  $119.990 (ilimitado). Feature-gating: COBROS solo cobranza + estado
  de alumnos (con take ~4,8% all-in sobre lo recaudado — ahí la
  cobranza ES el producto, compite con Membrezia); STUDIO operación
  completa; PRO = CRM/analítica/campañas/videos/multi-academia.
- **Producer Pro**: Pro $79.990 (≤$2,5M fact. 90d) → Growth $169.990
  (≤$8M) → Scale $299.990 (>$8M). Ticketing base nunca se corta — es
  el funnel del marketplace.
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
  eventos, cupos incluidos en tiers top + extras ~$12.990/campaña.
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
