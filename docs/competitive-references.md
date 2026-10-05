# Referencias competitivas - gestión de academias/membresías (CL)

> Recopilado oct-2026 para evaluaciones de roadmap y pricing. Fuentes:
> `boxmagicapp.com` (home + #section-pricing, Chile) y
> `membrezia.com/planes/` (planes + tabla comparativa + FAQ).
> Decisión vigente (oct-2026): **no competir en precio** - sin tier Lite;
> ver `omni-dance.md` §10 "Modelo SaaS".

## BoxMagic - gestión integral de centros deportivos

Competidor directo: gestión completa (no solo cobranza), multi-disciplina
(gimnasios, artes marciales, escuelas de fútbol, **centros de baile**,
pole dance, yoga…). Chile + México. +800 centros, +15M reservas, +400k
usuarios. Contrato mínimo 6 meses.

### Funcionalidades (home)

- Gestión de actividades/clases, espacios, canchas
- Gestión de reservas + control de aforo
- Gestión de membresías
- Marketing/comunicación con clientes
- Reportes y estadísticas
- Pagos online (medios diversificados)
- Sitio web propio (personalizable o integra la existente)
- App para usuarios (reservas y pagos; en Gold Plus "aplicación propia")
- Ecommerce / venta de productos
- Integraciones: Zoom, WhatsApp, Google Analytics, Gympass, Fitpass,
  Classpass "y muchas más"
- Boletas electrónicas SII (promo para clientes nuevos; certificado
  ~$14.000 aparte - ayudan a gestionarlo)
- Soporte pro + capacitaciones personalizadas (Gold Plus)

### Precios (CLP + IVA)

| Plan | Límite | Mensual | Trimestral −10% | Semestral −15% | Anual −20% |
|---|---|---|---|---|---|
| Básico Plus Mid | 120 | $39.900 | $107.700 | $203.490 | $382.900 |
| Silver Mid | 250 | $69.990 | $188.900 | $356.900 | $671.900 |
| Gold Plus | 2.000 | n/a | n/a | $1.121.949 (~$187k/mes) | $2.111.900 (~$176k/mes) |
| Enterprise | >2.000 | contacto ejecutivo | | | |

Mensual c/IVA: Básico ≈ **$47.500**, Silver ≈ **$83.300**, Gold ≈ **$222k**.

## Membrezia - cobranza/membresías (no gestión)

Producto de **recaudación** multi-vertical (empresas, colegios,
inmobiliarias, gimnasios, clubes, fundaciones…), Chile + México.
**El dinero va directo a la pasarela de la organización** - cada org
contrata su propio medio de pago (Webpay, OneClick, Khipu, Flow, Floid,
VirtualPos, Mercado Pago); Membrezia no liquida ni toca fondos. Pagos
por transferencia/efectivo se declaran manualmente. Cobro del servicio:
se cobran a sí mismos con la misma herramienta. Trial 7 días; anual
"ahorra hasta 2 meses" (~17%).

### Funcionalidades (tabla comparativa de su sitio)

| Área | Detalle |
|---|---|
| Admins | Usuarios administradores ilimitados + control de permisos; multi-nacionalidad |
| Recordatorios | Email ilimitado; WhatsApp API 50/80/150 gratis por plan, bolsas desde ~$36/msg; manuales por WhatsApp Web gratis |
| Portal pagos | Portal personalizado por organización; enlace de pago directo por cliente; enlaces para externos |
| Medios pago | 1 / 3 / ilimitados según plan |
| Clientes | Lista ilimitada, atributos/campos personalizados, formulario de registro por enlace, carga/descarga masiva Excel, credencial digital QR compatible Apple/Google Wallet |
| Cobros | Inscripción/matrícula, periódicos, variables, recurrentes, simples, por factura emitida (Corp+) |
| Fiscal (Corp+) | Integración facturación/boleta electrónica SII, emisión automática de BHE, lectura de facturas emitidas del SII |
| Reportes | Dashboard KPIs de ingresos, ranking de morosos, "tiempo ahorrado en cobranza", reporte mensual por email |
| Soporte | Acompañamiento automático + asistido (4/8/∞ sesiones), soporte WhatsApp 24/7 con IA+personas |
| API | Membrezia Cloud API (solo Corporativo+) |

### Precios (UF/mes + IVA; UF≈$39.500 oct-2026)

| Plan | UF | Límite | CLP c/IVA aprox. |
|---|---|---|---|
| Básico | 0,6 | 150 clientes | ~$28.200 |
| Corporativo | 1,0 | 300 | ~$47.000 |
| Enterprise | a medida | ilimitado | +0,5 UF por cada 150 extra |

## Comparativa rápida vs omni-dance

| | BoxMagic | Membrezia | omni-dance |
|---|---|---|---|
| Qué es | Gestión de centro deportivo | Cobranza de membresías | Gestión de academia + marketplace + nightlife |
| Cobro recurrente | Sí | **Core** | Sí (Flow) |
| Clases/horarios/reservas | Sí | No | Sí |
| Check-in QR | Control de aforo | Credencial QR (no asistencia) | **QR rotativo identidad** |
| Marketplace/descubrimiento | No | No | **Sí** |
| Ticketing/eventos | No | No | **Sí** |
| Fondos | Recauda la org (medios propios) | Directo a pasarela de la org | Pasarela omni + payout (onboarding sin pasarela propia) |
| Fiscal/SII | Boletas (promo) | Boletas/BHE/lectura SII (Corp+) | No |
| WhatsApp | Integración | Recordatorios API + bolsas | No (push/email) |
| Precio ~150 clientes | $69.990+IVA (Silver) | ~$28.200 c/IVA | $99.990 (PRO ≤150) |
| Trial | - | 7 días | 30 días |
| Descuentos ciclo | −10/15/20% (tri/sem/anual) | ~17% anual | −2%/−4% (sem/anual) |

## Gaps identificados (candidatos roadmap si se re-evalúa)

- **Recordatorios WhatsApp** - ambos lo tienen; nosotros solo push/email.
- **Integración SII/boletas** - los dos la monetizan como feature de pago.
- **Plata directa a cuenta de la org** - modelo de ambos; el nuestro
  (fondos por omni + payout) vende onboarding instantáneo pero exige
  confianza y espera de liquidación.
- **Carga masiva Excel** de alumnos/clientes (Membrezia).
- **Enlace de pago directo por cliente** y portal de pagos
  personalizado (Membrezia - cercano a nuestro perfil público de
  academia pero sin link por persona).
- **Credencial Wallet** (Apple/Google) - Membrezia; nosotros QR en PWA.
- **Integraciones** (Zoom, Gympass/Classpass, GA) - BoxMagic.
- **App con marca propia** - BoxMagic Gold Plus.
