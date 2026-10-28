// Baseline compartida por seed-dev y seed-prod-baseline: catálogo RBAC, permisos,
// grants, estilos y parámetros de plataforma. Todo idempotente - upserts
// por clave natural; find-or-create donde el schema no tiene unique.
import { PrismaClient, Genre, Gender } from "@prisma/client";

// Catálogo RBAC vivo en DB. Los roles solo se asignan por admin
// (POST /admin/users/:personId/roles) - no hay auto-solicitud.
// isSuperuser: pasa todo check de permisos (solo ADMIN - no editable por API).
const ROLE_CATALOG = [
  { key: "DANCER", label: "Bailarín" },
  { key: "DJ", label: "DJ" },
  { key: "PRODUCER", label: "Productor" },
  { key: "STAFF", label: "Staff" },
  { key: "VENUE_MANAGER", label: "Dueño de local" },
  { key: "ACADEMY_OWNER", label: "Dueño de academia" },
  { key: "INSTRUCTOR", label: "Instructor" },
  { key: "SUPPORT", label: "Soporte" },
  { key: "ADMIN", label: "Administrador", isSuperuser: true },
] as const;

// Permisos que las rutas exigen con @RequirePermissions + matriz rol→permiso.
const PERMISSION_CATALOG = [
  { key: "admin.access", description: "Panel de administración de plataforma" },
  { key: "checkins.write", description: "Operar check-in de puerta" },
  { key: "discounts.manage", description: "Crear y gestionar códigos de descuento" },
  { key: "social.manage", description: "Gestionar guest lists y waitlists" },
  { key: "academies.create", description: "Crear academia propia" },
  { key: "events.manage", description: "Crear y gestionar eventos propios (productor)" },
  { key: "crm.manage", description: "CRM del actor: scores, tags, campañas, triggers, payouts propios" },
  { key: "venues.manage", description: "Consola del local: dashboard operativo, arriendos y cartas" },
] as const;

const ROLE_GRANTS: Record<string, string[]> = {
  STAFF: ["checkins.write", "social.manage"],
  PRODUCER: ["discounts.manage", "social.manage", "events.manage", "crm.manage"],
  ACADEMY_OWNER: ["academies.create", "crm.manage"],
  VENUE_MANAGER: ["venues.manage"],
  // ADMIN: isSuperuser - pasa todo sin grants explícitos
};

// Catálogo de estilos - data de producto, no demo (aplica a prod también).
const STYLE_CATALOG = [
  { name: "Salsa cubana (casino)", genre: Genre.CUBANO },
  { name: "Salsa on1", genre: Genre.SALSA },
  { name: "Bachata sensual", genre: Genre.BACHATA },
  { name: "Bachata tradicional", genre: Genre.BACHATA },
  { name: "Bachata moderna", genre: Genre.BACHATA },
  { name: "Cubano", genre: Genre.CUBANO },
  { name: "Afrocubano", genre: Genre.CUBANO },
  { name: "Rueda de casino", genre: Genre.CUBANO },
  { name: "Mambo on2", genre: Genre.SALSA },
  { name: "Fusión", genre: Genre.OTHER },
] as const;

// Catálogos de clases de academia - mantenibles desde /admin/catalogos.
const CLASS_LEVEL_CATALOG = [
  { name: "Iniciación", order: 0 },
  { name: "Básico", order: 1 },
  { name: "Intermedio", order: 2 },
  { name: "Avanzado", order: 3 },
] as const;

const CLASS_TYPE_CATALOG = [
  { name: "Pareja" },
  { name: "Shines" },
  { name: "Corporalidad" },
] as const;

// Defaults operativos - update:{} no pisa valores editados desde /admin.
const PARAM_DEFAULTS: Array<{
  key: string;
  value: unknown;
  description: string;
}> = [
  // Los keys service_fee.* quedaron fuera del modelo (spec
  // producer-fee-model): el comprador paga el precio publicado exacto.
  // Filas legacy pueden persistir en DBs existentes (el upsert no borra)
  // y solo las lee el settlement para reconstruir tickets de pagos
  // legacy sin unitServiceFee congelado.
  { key: "session.cooldown_minutes", value: 4, description: "Minutos de cooldown entre sesiones del mismo par" },
  { key: "qr.rotation_seconds", value: 60, description: "Segundos de vigencia del QR personal rotativo" },
  { key: "prime_time.window_minutes", value: 30, description: "Minutos de la ventana Prime Time" },
  { key: "prime_time.threshold_pct", value: 0.2, description: "Umbral Prime Time como fracción del aforo" },
  { key: "early_checkin.cutoff_minutes", value: 1380, description: "Minutos desde medianoche - check-in antes de esta hora (23:00) cuenta como temprano (badge madrugador + puntos early_checkin)" },
  { key: "series_pass.price_clp", value: 25000, description: "Precio mensual del pase de serie (CLP) - fallback si la serie no define precio propio" },
  { key: "platform_fee.default_pct", value: 0, description: "Comisión legacy sobre ventas (%) - solo para pagos pre-modelo sin desglose congelado (feeMode null); el modelo nuevo usa fees.managed_allin_pct" },
  // ─── Modelo comisión todo incluido (spec producer-fee-model) ───
  // El comprador paga el precio publicado exacto; la plataforma cobra al
  // productor una comisión all-in que incluye pasarela + fee neto + IVA.
  // all-in = gateway_fee.card_pct + fee neto × (1 + tax.iva_pct):
  // 3,19 + 5,0 × 1,19 = 9,14 → fee plataforma 5% + IVA + pasarela.
  { key: "fees.standard_fee_pct", value: 3.5, description: "Fee neto del tier Standard (PRO_GROWTH) - all-in = 3,5×1,19 + 3,19 = ~7,36%" },
  { key: "fees.pro_fee_pct", value: 2.5, description: "Fee neto del tier Pro (PRO_BIG) - all-in = 2,5×1,19 + 3,19 = ~6,17%" },
  { key: "fees.managed_allin_pct", value: 9.14, description: "Comisión todo incluido sobre ventas gestionadas (%): 5% fee + IVA + 3,19% pasarela - default global; cadena: override evento → default productor (platformFeePct) → este param" },
  { key: "gateway_fee.card_pct", value: 3.19, description: "Costo esperado de pasarela por tarjeta (%) - base del desglose all-in de órdenes MANAGED" },
  { key: "tax.iva_pct", value: 19, description: "IVA (%) aplicado sobre el fee neto de plataforma - componente de la comisión all-in" },
  // Proveedor que procesa las órdenes nuevas (spec
  // gateway-port-normalization): el checkout lo resuelve contra el
  // GatewayRegistry; si el provider no está registrado (sin
  // credenciales) cae al default del env. Valores: FLOW | MERCADOPAGO.
  { key: "payments.default_gateway", value: "FLOW", description: "Proveedor de pago por defecto para órdenes nuevas (FLOW | MERCADOPAGO | FINTOC) - resuelto contra el GatewayRegistry; sin credenciales cae al default del env" },
  // Proveedor del motor de suscripciones (spec
  // subscription-port-generic): mismo mecanismo de resolución que
  // default_gateway; si el provider elegido no implementa
  // SubscriptionProvider, los flujos de suscripción fallan explícito.
  { key: "payments.subscription_gateway", value: "FLOW", description: "Proveedor del motor de suscripciones (FLOW hoy; STUB en dev) - resuelto contra el GatewayRegistry; sin valor cae al default del env" },
  { key: "crm.winback_days", value: 21, description: "Días sin actividad para que el trigger WINBACK dispare y para que el score ACADEMY marque AT_RISK" },
  // Score de relación ACADEMY (spec academy-score-refine): pesos de cada
  // señal del score 0-100 y umbrales de segmento.
  { key: "crm.score.attendance_weeks", value: 8, description: "Semanas hacia atrás que cuenta la asistencia reciente del score de alumno" },
  { key: "crm.score.attendance_pts", value: 4, description: "Puntos por asistencia reciente (score de alumno)" },
  { key: "crm.score.streak_cap", value: 8, description: "Tope de semanas de racha que puntúan (score de alumno)" },
  { key: "crm.score.streak_pts", value: 3, description: "Puntos por semana de racha actual (score de alumno)" },
  { key: "crm.score.months_cap", value: 6, description: "Tope de meses continuos que puntúan (score de alumno)" },
  { key: "crm.score.months_pts", value: 4, description: "Puntos por mes continuo con actividad/membresía (score de alumno)" },
  { key: "crm.score.purchase_months", value: 6, description: "Meses hacia atrás que cuentan las compras (score de alumno)" },
  { key: "crm.score.purchase_cap", value: 6, description: "Tope de compras que puntúan (score de alumno)" },
  { key: "crm.score.purchase_pts", value: 3, description: "Puntos por compra PAID/claim aprobado (score de alumno)" },
  { key: "crm.score.tenure_cap", value: 12, description: "Tope de meses de antigüedad que puntúan (score de alumno)" },
  { key: "crm.score.tenure_pts", value: 1, description: "Puntos por mes de antigüedad (score de alumno)" },
  { key: "crm.score.referral_pts", value: 5, description: "Puntos por referral (score de alumno)" },
  { key: "crm.score.core_min", value: 60, description: "Score mínimo para segmento CORE" },
  // Producer-score (spec producer-score-refine): compra "anticipada" =
  // payment creado ≥early_days antes de event.startsAt.
  { key: "crm.score.early_days", value: 3, description: "Días antes del evento para que una compra cuente como anticipada (score de asistente)" },
  { key: "crm.score.early_cap", value: 3, description: "Tope de compras anticipadas que puntúan (score de asistente)" },
  { key: "crm.score.early_pts", value: 2, description: "Puntos por compra anticipada (score de asistente)" },
  { key: "crm.new_days", value: 30, description: "Días desde la primera actividad para segmento NEW" },
  { key: "crm.brings_people_referrals", value: 2, description: "Referrals mínimos para segmento BRINGS_PEOPLE" },
  { key: "classes.cancel_refund_minutes", value: 60, description: "Minutos antes del inicio de la clase hasta los que cancelar devuelve el crédito de la cuota - después la reserva se puede cancelar pero la clase se pierde" },
  // ─── SaaS billing (spec academy-saas-billing) ───
  // Tiers de academia por FEATURES (spec academy-tier-cobros, omni-dance.md
  // §10): COBROS (cobranza pura) < STUDIO (operación completa) < PRO
  // (analítica/CRM/marketing/multi-academia). STARTER queda legacy:
  // conserva precio/tope para las suscripciones existentes pero ya no se
  // vende (fuera de SELF_SERVE_ACADEMY_TIERS). PRO/ENTERPRISE sin tope.
  { key: "academy_tier.cobros_max_students", value: 60, description: "Máximo de alumnos activos del tier COBROS de academia" },
  { key: "academy_tier.studio_max_students", value: 150, description: "Máximo de alumnos activos del tier STUDIO de academia" },
  { key: "academy_tier.starter_max_students", value: 50, description: "Máximo de alumnos activos del tier STARTER de academia (legado - ya no se vende)" },
  // Precio mensual base por tier (CLP/mes) - el cobro del ciclo se
  // calcula: semestral ×5.52 (−8%), anual ×10.2 (−15%).
  // Precios "calculados" (terminación 200/500/700) - decisión de
  // posicionamiento: se perciben derivados de costos; no usar
  // terminación .990 (charm pricing se lee como "precio de descuento").
  { key: "academy_tier.cobros_monthly_clp", value: 39500, description: "Precio mensual tier COBROS de academia (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "academy_tier.studio_monthly_clp", value: 79700, description: "Precio mensual tier STUDIO de academia (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "academy_tier.pro_monthly_clp", value: 120500, description: "Precio mensual tier PRO de academia (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "academy_tier.starter_monthly_clp", value: 49990, description: "Precio mensual tier STARTER de academia (CLP, legado) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  // Take de cobranza del tier COBROS: el payout de academias COBROS
  // descuenta take_multiplier × el fee de pasarela sobre cobros de
  // membresías (línea ACADEMY_COBROS_TAKE tipada; 1,5× ≈ 4,8% all-in).
  { key: "academy_cobros.take_multiplier", value: 1.5, description: "Multiplicador del fee de pasarela cobrado como take a academias tier COBROS (sobre membresías)" },
  // Ciclo de facturación de academia: trial de onboarding, grace de
  // lanzamiento para las existentes y gracia por mora antes del bloqueo.
  { key: "academy_billing.trial_days", value: 30, description: "Días de trial de onboarding para academias nuevas (sin tarjeta upfront)" },
  { key: "academy_billing.migration_grace_days", value: 60, description: "Días de grace de lanzamiento para academias existentes al despliegue SaaS" },
  { key: "academy_billing.grace_days", value: 5, description: "Días calendario de gracia tras invoice impaga antes del bloqueo por mora" },
  // Tiers Producer Pro: límite de facturación mensual media 90d por tier.
  { key: "producer_tier.starter_max_monthly_clp", value: 2500000, description: "Facturación mensual máxima del tier PRO_STARTER (CLP)" },
  { key: "producer_tier.growth_max_monthly_clp", value: 8000000, description: "Facturación mensual máxima del tier PRO_GROWTH (CLP)" },
  { key: "producer_tier.starter_monthly_clp", value: 79700, description: "Precio mensual tier PRO_STARTER/Pro (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "producer_tier.growth_monthly_clp", value: 79700, description: "Precio mensual tier PRO_GROWTH/Standard (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "producer_tier.big_monthly_clp", value: 169500, description: "Precio mensual tier PRO_BIG/Pro (CLP) - semestral cobra ×5.52 (-8%), anual ×10.2 (-15%)" },
  { key: "producer_tier.free_staff_max", value: 2, description: "Staff máximo por evento sin suscripción Pro - 1-2 personas en puerta es la norma; multiStaff (Pro) se exige solo sobre este cupo" },
  // Costo de pasarela descontado del payout de academia (línea GATEWAY_FEE_PASSTHROUGH).
  { key: "gateway_fee.academy_passthrough_pct", value: 3.19, description: "% de pasarela descontado del payout de academia" },
  // Ventanas de los insights de retención del dashboard de academia
  // (spec academies/owner-insights): planes por vencer y cumpleaños.
  { key: "academy.insights.expiring_days", value: 14, description: "Días hacia adelante para listar planes por vencer en el dashboard de academia" },
  { key: "academy.insights.birthday_days", value: 30, description: "Días hacia adelante para listar cumpleaños de alumnos en el dashboard de academia" },
  // Recordatorios de renovación (spec academy-renewal-reminders):
  // primer aviso por email N días antes del endsAt; la gracia es además
  // la ventana en que resolveQuota sigue habilitando reservas vencidas.
  { key: "academy.renewal.first_notice_days", value: 5, description: "Días antes del endsAt para el primer email de renovación" },
  { key: "academy.renewal.grace_days", value: 5, description: "Días de gracia tras endsAt: aviso de regularización + reservas habilitadas" },
  // ─── Pase Social (spec pase-social, flag social_pass OFF) ───
  { key: "social_pass.credits_per_month", value: 4, description: "Entradas a crédito por período del Pase Social (reset duro - no acumulan)" },
  { key: "social_pass.price_clp", value: 15000, description: "Precio mensual fallback del Pase Social (CLP) - el precio real por país vive en TierPrice SOCIAL_PASS" },
];

/** Catálogo de badges - las keys deben coincidir con BadgeAwarder (gamification/rules.ts). */
const BADGE_CATALOG = [
  { key: "primera_bachata", name: "Primera bachata", category: "MILESTONE" },
  { key: "bailarin_constante", name: "Bailarín constante", category: "MILESTONE" },
  { key: "madrugador", name: "Madrugador", category: "CONDUCT" },
  { key: "maratonista", name: "Maratonista", category: "CONDUCT" },
  { key: "mariposa_social", name: "Mariposa social", category: "CONDUCT" },
  { key: "prime_time_crown", name: "Corona Prime Time", category: "TEMPORARY_STATUS" },
  // Modo Academy - conducta del alumno (asistencia/constancia/exploración).
  { key: "primera_clase", name: "Primera clase", category: "MILESTONE" },
  { key: "alumno_constante", name: "Alumno constante", category: "MILESTONE" },
  { key: "racha_academia", name: "Constancia de academia", category: "CONDUCT" },
  { key: "explorador_academias", name: "Explorador de academias", category: "CONDUCT" },
] as const;

/**
 * Textos legales vigentes por jurisdicción (spec
 * consent-por-jurisdiccion). CL: consentimiento único "essential" -
 * el body es una consolidación fiel de la Política de Privacidad
 * pública (/privacidad) hasta que legal entregue el copy final
 * (draftNote). EU: texto base GDPR con consentimiento granular -
 * CONTENIDO PRELIMINAR pendiente de revisión legal (draftNote), no
 * publicar como definitivo.
 */
const LEGAL_TEXT_SEED: {
  jurisdiction: string;
  version: string;
  granular: boolean;
  requiredScopes: string[];
  draftNote: string;
  body: string;
}[] = [
  {
    jurisdiction: "CL",
    version: "cl-v1.0",
    granular: false,
    requiredScopes: ["essential"],
    draftNote: "consolidar con copy de /privacidad",
    body: `Política de Privacidad y Términos de Omnidance (Chile) - versión consolidada 1.0.

Responsable del tratamiento: Omni Dance SpA. Esta política se rige por la Ley N° 19.628 sobre Protección de la Vida Privada, según modificada por la Ley N° 21.719 sobre Protección de los Datos Personales, y su reglamento.

Datos que tratamos: cuenta (nombre, correo, teléfono optativo), perfil de baile (género, estilos, roles y nivel autodeclarados), actividad (check-ins QR, sesiones de baile y valoraciones - siempre privadas y agregadas, nunca individuales), pagos procesados por Flow (no almacenamos datos de tarjetas), tokens push y registros técnicos. NO recolectamos geolocalización ni datos sensibles.

Finalidades: operar la plataforma (identidad QR, entradas, academias), notificaciones transaccionales, seguridad y prevención de fraude, estadísticas agregadas y anonimizadas, y cumplimiento de obligaciones tributarias. Base legal: tu consentimiento como titular y la ejecución del contrato de uso de la plataforma.

Compartimos datos con encargados de tratamiento que actúan por cuenta nuestra: Flow (pagos), Resend (correos transaccionales), proveedor de hosting e infraestructura, y Apple/Google (notificaciones push). Algunos procesan datos fuera de Chile bajo contratos con nivel de protección adecuado.

Tus derechos (personales, intransferibles, irrenunciables y gratuitos): acceso, rectificación, supresión, oposición, bloqueo del tratamiento y portabilidad. Para ejercerlos escribe a privacidad@omnidance.cl indicando tu nombre, correo de la cuenta y el derecho que ejerces.

Conservamos tus datos mientras tu cuenta esté activa; tras el cierre, solo lo necesario por los plazos legales. La plataforma está dirigida a mayores de 18 años. Usamos una cookie de sesión necesaria y no usamos cookies publicitarias de terceros. Si esta política cambia de forma material, te pediremos un nuevo consentimiento.`,
  },
  {
    jurisdiction: "EU",
    version: "eu-v1.0",
    granular: true,
    requiredScopes: ["essential", "marketing", "analytics"],
    draftNote:
      "redactado sobre patrón art. 13 RGPD (Google/Apple/Civitatis): propósito→base legal→destinatario por capas. Pendiente firma de counsel antes de abrir Europa comercialmente",
    body: `Política de Privacidad de Omnidance (Espacio Económico Europeo, Reino Unido y Suiza) - versión 1.0.

1. Responsable y contacto. Omni Dance SpA es el responsable del tratamiento en los términos del Reglamento (UE) 2016/679 (RGPD). Contacto para todo lo relativo a datos personales y ejercicio de derechos: privacidad@omnidance.cl.

2. Datos que tratamos. (a) Datos de cuenta: nombre, correo electrónico y teléfono optativo. (b) Perfil de baile autodeclarado: género, estilos, roles y nivel. (c) Actividad en la plataforma: check-ins QR, sesiones de baile y valoraciones - estas últimas siempre en forma agregada y nunca accesibles de forma individual. (d) Datos de transacción: compras de entradas y membresías; los datos de tu tarjeta los trata exclusivamente el procesador de pagos, nunca los almacenamos. (e) Datos técnicos: identificadores de dispositivo para notificaciones push, registros de seguridad y registros de consentimiento. No tratamos categorías especiales de datos en los términos del art. 9 RGPD ni datos de geolocalización.

3. Finalidades y base jurídica (art. 6 RGPD). (a) Prestación del servicio: operar tu cuenta, la identidad QR, la venta de entradas, las academias y las notificaciones transaccionales - base: ejecución del contrato (art. 6.1.b). (b) Seguridad y prevención de fraude - base: interés legítimo (art. 6.1.f), evaluado para no prevalecer sobre tus derechos. (c) Cumplimiento de obligaciones legales y tributarias - base: obligación legal (art. 6.1.c). (d) Comunicaciones de marketing - base: tu consentimiento expreso y separado (art. 6.1.a). (e) Analítica de uso para mejorar el producto - base: tu consentimiento expreso y separado (art. 6.1.a). Facilitar los datos es requisito contractual para usar la plataforma; negarte a los consentimientos opcionales no afecta el servicio esencial.

4. Consentimiento y su retiro. Pedimos tu consentimiento de forma granular: esencial (necesario para operar), marketing y analítica, cada uno activable por separado. Puedes retirar cualquier consentimiento opcional en cualquier momento desde la configuración de tu cuenta o escribiendo a privacidad@omnidance.cl - retirarlo es tan fácil como otorgarlo y no afecta la licitud del tratamiento previo a tu retiro. Registramos la fecha, versión del texto y alcance de cada aceptación como prueba del consentimiento.

5. Destinatarios y transferencias internacionales. Compartimos datos con encargados de tratamiento bajo contrato: procesador de pagos, proveedor de correo transaccional, hosting e infraestructura, y servicios de notificaciones push de Apple/Google. Algunos tratan datos fuera del EEE; en esos casos aplicamos las garantías del capítulo V RGPD (decisión de adecuación vigente o cláusulas contractuales tipo de la Comisión Europea). No vendemos tus datos personales.

6. Conservación. Mantenemos tus datos mientras la cuenta esté activa. Tras el cierre, conservamos únicamente lo exigido por plazos legales (registros tributarios y de consentimiento) y luego eliminamos o anonimizamos. Los datos de analítica se conservan en forma agregada o anonimizada.

7. Tus derechos. Tienes derecho a acceso, rectificación, supresión ("derecho al olvido"), limitación del tratamiento, portabilidad en formato estructurado, oposición al tratamiento basado en interés legítimo y a no ser objeto de decisiones exclusivamente automatizadas con efectos jurídicos o igualmente significativos - en esta plataforma no existen tales decisiones. Ejercelos en privacidad@omnidance.cl; respondemos dentro de un mes. Además puedes reclamar ante la autoridad de control de protección de datos de tu Estado miembro (por ejemplo, la AEPD en España) o ante las autoridades judiciales.

8. Edad mínima y cookies. La plataforma está dirigida a mayores de 18 años. Usamos la cookie de sesión estrictamente necesaria; las tecnologías de medición o publicitarias de terceros solo se activan si otorgas el consentimiento de analítica correspondiente.

9. Cambios. Si esta política cambia de forma material te lo notificaremos con antelación y solicitaremos de nuevo tu consentimiento cuando la base jurídica aplicable lo exija.`,
  },
];

/**
 * Flags de funcionalidad (spec feature-flags-admin): catálogo global -
 * un flag sin consumer no sirve, por eso el alta es solo por seed y la
 * UI de /admin/funcionalidades solo togglea `enabled`. `social_pass`
 * nace apagado (feature en desarrollo); el resto nace encendido.
 * El upsert NO pisa `enabled`: re-correr el seed no revierte un toggle
 * hecho por admin (update solo refresca label/description).
 */
const FEATURE_FLAG_SEED: {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
}[] = [
  {
    key: "social_pass",
    label: "Pase Social",
    description: "Suscripción del bailarín multipaís - aún en desarrollo",
    enabled: false,
  },
  {
    key: "trip_planner",
    label: "Mi viaje",
    description: "Planificador de viaje del bailarín entre ciudades",
    enabled: true,
  },
  {
    key: "city_guides",
    label: "Guías de ciudad",
    description: "Guías de la escena local por ciudad",
    enabled: true,
  },
  {
    key: "city_landing",
    label: "Landing por ciudad",
    description: "Landing pública de cada ciudad (marketing local)",
    enabled: true,
  },
  {
    key: "social_line",
    label: "Línea Nightlife",
    description: "Superficies sociales del bailarín (eventos, bailes, prácticas) - OFF si la operación parte solo con academias",
    enabled: true,
  },
  {
    key: "academy_line",
    label: "Línea Academy",
    description: "Superficies de academia del bailarín (clases, directorio) - OFF si la operación parte solo con nightlife",
    enabled: true,
  },
];

/** Crea o confirma una persona con sus roles. Idempotente por email. */
export async function ensurePerson(
  prisma: PrismaClient,
  email: string,
  name: string,
  roles: Array<{ role: string; status?: "PENDING" | "SANDBOX" | "APPROVED" }>,
  gender?: Gender,
) {
  const person = await prisma.person.upsert({
    where: { email },
    update: { name, gender },
    create: { email, name, gender },
  });
  for (const r of roles) {
    await prisma.personRole.upsert({
      where: { personId_role: { personId: person.id, role: r.role } },
      update: { status: r.status ?? "APPROVED" },
      create: {
        personId: person.id,
        role: r.role,
        status: r.status ?? "APPROVED",
      },
    });
  }
  return person;
}

/** Baseline de plataforma - corre en dev y prod antes del dataset propio. */
export async function seedCommon(prisma: PrismaClient) {
  // ─── Catálogo RBAC (debe existir antes que PersonRole por FK) ───
  for (const r of ROLE_CATALOG) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: {
        label: r.label,
        requestable: false,
        isSuperuser: "isSuperuser" in r,
      },
      create: { ...r, isSuperuser: "isSuperuser" in r },
    });
  }
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    });
  }
  for (const [roleKey, perms] of Object.entries(ROLE_GRANTS)) {
    for (const permissionKey of perms) {
      await prisma.rolePermission.upsert({
        where: { roleKey_permissionKey: { roleKey, permissionKey } },
        update: {},
        create: { roleKey, permissionKey },
      });
    }
  }

  // ─── Estilos - find-or-create por nombre (sin unique en schema) ───
  for (const s of STYLE_CATALOG) {
    const existing = await prisma.style.findFirst({ where: { name: s.name } });
    if (existing) {
      if (existing.genre !== s.genre) {
        await prisma.style.update({
          where: { id: existing.id },
          data: { genre: s.genre },
        });
      }
    } else {
      await prisma.style.create({ data: s });
    }
  }

  // Depuración del catálogo: estilos que salieron de STYLE_CATALOG pero
  // DBs ya pobladas conservan las filas. Acá se eliminan con sus
  // referencias personales; las referencias estructurales (series,
  // bloques de horario, sesiones) quedan desvinculadas (null).
  const REMOVED_STYLES = ["Salsa on2", "Bachata dominicana", "Timba"];
  for (const stale of await prisma.style.findMany({
    where: { name: { in: REMOVED_STYLES } },
  })) {
    await prisma.personStyleRole.deleteMany({ where: { styleId: stale.id } });
    await prisma.danceSession.updateMany({
      where: { styleId: stale.id },
      data: { styleId: null },
    });
    await prisma.scheduleBlock.updateMany({
      where: { styleId: stale.id },
      data: { styleId: null },
    });
    await prisma.classSeries.updateMany({
      where: { styleId: stale.id },
      data: { styleId: null },
    });
    await prisma.style.updateMany({
      where: { parentId: stale.id },
      data: { parentId: null },
    });
    await prisma.style.delete({ where: { id: stale.id } });
  }

  // ─── Catálogos de clases (nivel/tipo) - upsert por nombre unique ───
  for (const l of CLASS_LEVEL_CATALOG) {
    await prisma.classLevel.upsert({
      where: { name: l.name },
      update: { order: l.order },
      create: l,
    });
  }
  // Rename "En Pareja" → "Pareja" (nombre corto del catálogo) - preserva
  // el id y los ClassSeriesType existentes; si ambos ya existen no choca.
  const legacyEnPareja = await prisma.classType.findUnique({
    where: { name: "En Pareja" },
  });
  if (legacyEnPareja) {
    const pareja = await prisma.classType.findUnique({
      where: { name: "Pareja" },
    });
    if (!pareja) {
      await prisma.classType.update({
        where: { id: legacyEnPareja.id },
        data: { name: "Pareja" },
      });
    }
  }
  for (const ct of CLASS_TYPE_CATALOG) {
    await prisma.classType.upsert({
      where: { name: ct.name },
      update: {},
      create: ct,
    });
  }

  // ─── Badges - catálogo para que BadgeAwarder pueda otorgar ───
  for (const b of BADGE_CATALOG) {
    await prisma.badge.upsert({
      where: { key: b.key },
      update: { name: b.name, category: b.category },
      create: b,
    });
  }

  // ─── Parámetros - nunca pisar valores editados en /admin ───
  for (const p of PARAM_DEFAULTS) {
    await prisma.platformParam.upsert({
      where: { key: p.key },
      update: {},
      create: { key: p.key, value: p.value as never, description: p.description },
    });
  }

  // ─── Geografía base (spec multipais-foundation): Chile/Santiago
  // como ciudad 0 - idempotente, replica el backfill de la migración.
  await prisma.country.upsert({
    where: { code: "CL" },
    update: {},
    create: {
      id: "country-cl",
      code: "CL",
      name: "Chile",
      currency: "CLP",
    },
  });
  await prisma.city.upsert({
    where: { slug: "santiago-cl" },
    update: {},
    create: {
      id: "city-stgo-cl",
      countryId: "country-cl",
      name: "Santiago",
      slug: "santiago-cl",
      lat: -33.4489,
      lng: -70.6693,
      timezone: "America/Santiago",
      geohash: "66rcc",
    },
  });
  await prisma.venue.updateMany({
    where: { cityId: null },
    data: { cityId: "city-stgo-cl" },
  });
  await prisma.event.updateMany({
    where: { cityId: null },
    data: { cityId: "city-stgo-cl" },
  });
  await prisma.academy.updateMany({
    where: { cityId: null },
    data: { cityId: "city-stgo-cl" },
  });

  // ─── Flags de funcionalidad (spec feature-flags-admin) - upsert por
  // key que NO pisa `enabled`: el default del seed solo aplica al crear;
  // un flag ya toggleado por admin conserva su estado al re-sembrar.
  for (const f of FEATURE_FLAG_SEED) {
    await prisma.featureFlag.upsert({
      where: { key: f.key },
      update: { label: f.label, description: f.description },
      create: f,
    });
  }

  // ─── Textos legales por jurisdicción (spec consent-por-jurisdiccion)
  // Upsert por (jurisdiction, version): re-correr el seed no duplica ni
  // pisa edits hechos en admin (update:{} conserva el contenido).
  for (const lt of LEGAL_TEXT_SEED) {
    await prisma.legalText.upsert({
      where: {
        jurisdiction_version: {
          jurisdiction: lt.jurisdiction,
          version: lt.version,
        },
      },
      update: {},
      create: lt,
    });
  }

  // ─── Price book del Pase Social (spec pase-social): precio por país
  // vía TierPrice tierCode=SOCIAL_PASS. `kind`/`billingCycle` son
  // requeridos por el schema aunque el pase no es ni ACADEMY ni PRODUCER
  // - se siembra con kind PRODUCER / MONTHLY como placeholder hasta que
  // exista un kind de bailarín (el resolver busca por tierCode+country).
  // update:{} no pisa precios editados por admin.
  await prisma.tierPrice.upsert({
    where: {
      tierCode_kind_billingCycle_countryCode: {
        tierCode: "SOCIAL_PASS",
        kind: "PRODUCER",
        billingCycle: "MONTHLY",
        countryCode: "CL",
      },
    },
    update: {},
    create: {
      tierCode: "SOCIAL_PASS",
      kind: "PRODUCER",
      billingCycle: "MONTHLY",
      countryCode: "CL",
      price: 15000,
      currency: "CLP",
    },
  });

  // ─── Price book de tiers SaaS (spec multipais-currency): filas CL
  // derivadas de los params *_monthly_clp vigentes para que el price
  // book converja con la resolución legacy (cobro del ciclo = mensual ×
  // 1 / ×5.52 semestral / ×10.2 anual - misma política que
  // cycleChargeClp). update:{} no pisa precios editados por admin.
  // ENTERPRISE/PRO_BIG son "a convenir" (sin param) → no se siembran.
  const CYCLE_FACTOR = { MONTHLY: 1, SEMIANNUAL: 5.52, ANNUAL: 10.2 } as const;
  const paramVal = (key: string) =>
    PARAM_DEFAULTS.find((p) => p.key === key)?.value as number;
  // displayName: nombre público editable (desacoplado del tierCode
  // persistido) - el front usa su mapa i18n si es null.
  const tierPriceSeed: {
    tierCode: string;
    kind: "ACADEMY" | "PRODUCER";
    monthlyKey: string;
    displayName: string;
  }[] = [
    { tierCode: "COBROS", kind: "ACADEMY", monthlyKey: "academy_tier.cobros_monthly_clp", displayName: "Starter" },
    { tierCode: "STUDIO", kind: "ACADEMY", monthlyKey: "academy_tier.studio_monthly_clp", displayName: "Studio" },
    { tierCode: "PRO", kind: "ACADEMY", monthlyKey: "academy_tier.pro_monthly_clp", displayName: "Pro" },
    { tierCode: "PRO_STARTER", kind: "PRODUCER", monthlyKey: "producer_tier.starter_monthly_clp", displayName: "Starter" },
    { tierCode: "PRO_GROWTH", kind: "PRODUCER", monthlyKey: "producer_tier.growth_monthly_clp", displayName: "Standard" },
    { tierCode: "PRO_BIG", kind: "PRODUCER", monthlyKey: "producer_tier.big_monthly_clp", displayName: "Pro" },
  ];
  for (const t of tierPriceSeed) {
    const monthly = paramVal(t.monthlyKey);
    for (const cycle of ["MONTHLY", "SEMIANNUAL", "ANNUAL"] as const) {
      await prisma.tierPrice.upsert({
        where: {
          tierCode_kind_billingCycle_countryCode: {
            tierCode: t.tierCode,
            kind: t.kind,
            billingCycle: cycle,
            countryCode: "CL",
          },
        },
        update: {},
        create: {
          tierCode: t.tierCode,
          kind: t.kind,
          billingCycle: cycle,
          countryCode: "CL",
          price: Math.round(monthly * CYCLE_FACTOR[cycle]),
          currency: "CLP",
          displayName: t.displayName,
        },
      });
    }
  }

  console.log(
    `  baseline: ${ROLE_CATALOG.length} roles, ${PERMISSION_CATALOG.length} permisos, ${STYLE_CATALOG.length} estilos, ${BADGE_CATALOG.length} badges, ${PARAM_DEFAULTS.length} params`,
  );
}
