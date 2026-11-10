# Referencias competitivas - gestión de academias/membresías (CL)

> Recopilado oct-2026 para evaluaciones de roadmap y pricing; columna
> omni-dance actualizada nov-2026 (tiers COBROS/STUDIO/PRO, BYO
> collections, trial 15d, import de alumnos). Fuentes:
> `boxmagicapp.com` (home + #section-pricing, Chile) y
> `membrezia.com/planes/` (planes + tabla comparativa + FAQ).
> Decisión vigente (oct-2026): **no competir en precio** - sin tier Lite;
> ver `omni-dance.md` §10 "Modelo SaaS" y `pitch-comercial-tiers.md`.

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
| Cobro recurrente | Sí | **Core** | Sí (Flow; Stripe para pase/subs multi-país) |
| Clases/horarios/reservas | Sí | No | Sí |
| Check-in QR | Control de aforo | Credencial QR (no asistencia) | **QR rotativo identidad** |
| Marketplace/descubrimiento | No | No | **Sí** |
| Ticketing/eventos | No | No | **Sí** |
| Alta de alumnos | Carga Excel | Carga/descarga masiva Excel | **Import CSV/XLSX con dry-run** (canal de invitación: mail magic link 7d + push in-app a quien ya tiene cuenta; cada invitada aterriza en la ficha con lente academy por cualquiera de los dos caminos) |
| Fondos | Recauda la org (medios propios) | Directo a pasarela de la org | **BYO**: pasarela propia de la academia (Flow/MP), plata directa a su cuenta + take 1% neto+IVA facturado mes vencido; ticketing sigue por pasarela omni + payout |
| Fiscal/SII | Boletas (promo) | Boletas/BHE/lectura SII (Corp+) | No |
| WhatsApp | Integración | Recordatorios API + bolsas | No (push/email) |
| Precio ~150 clientes | $69.990+IVA (Silver) | ~$28.200 c/IVA | $79.700 (STUDIO; COBROS ≤60 a $39.500, PRO ilimitado $120.500) |
| Trial | - | 7 días | 15 días a nivel Studio |
| Descuentos ciclo | −10/15/20% (tri/sem/anual) | ~17% anual | −8% semestral / −15% anual |

## Gaps identificados (candidatos roadmap si se re-evalúa)

Cerrados desde la recopilación (nov-2026):

- ~~**Plata directa a cuenta de la org**~~ - BYO collections: la
  academia cobra con su propia pasarela (Flow/MP), la plata va directo
  a su cuenta y omnidance factura el take 1% neto+IVA mes vencido.
- ~~**Carga masiva Excel**~~ - `/academia/configuracion/importar`:
  CSV/XLSX con validación dry-run + historial por corrida, como canal
  de invitación (no escribe enrollments).
- ~~**Credencial Wallet**~~ (parcial) - Google Wallet existe para
  tickets de eventos; la credencial de membresía de academia sigue
  pendiente (QR rotativo en PWA cubre el caso de uso).

Abiertos:

- **Recordatorios WhatsApp** - ambos lo tienen; nosotros solo push/email.
- **Integración SII/boletas** - los dos la monetizan como feature de pago.
- **Enlace de pago directo por cliente** y portal de pagos
  personalizado (Membrezia - cercano a nuestro perfil público de
  academia pero sin link por persona).
- **Integraciones** (Zoom, Gympass/Classpass, GA) - BoxMagic.
- **App con marca propia** - BoxMagic Gold Plus.
