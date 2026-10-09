// Baseline compartida por seed-dev y seed-prod-baseline: catálogo RBAC, permisos,
// grants, estilos y parámetros de plataforma. Todo idempotente - upserts
// por clave natural; find-or-create donde el schema no tiene unique.
import { PrismaClient, Genre, Gender } from "@prisma/client";

// Catálogo RBAC vivo en DB. Los roles solo se asignan por admin
// (POST /admin/users/:personId/roles) - no hay auto-solicitud.
// isSuperuser: pasa todo check de permisos (solo ADMIN - no editable por API).
export const ROLE_CATALOG = [
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
export const PERMISSION_CATALOG = [
  { key: "admin.access", description: "Panel de administración de plataforma" },
  { key: "checkins.write", description: "Operar check-in de puerta" },
  { key: "discounts.manage", description: "Crear y gestionar códigos de descuento" },
  { key: "social.manage", description: "Gestionar guest lists y waitlists" },
  { key: "academies.create", description: "Crear academia propia" },
  { key: "events.manage", description: "Crear y gestionar eventos propios (productor)" },
  { key: "crm.manage", description: "CRM del actor: scores, tags, campañas, triggers, payouts propios" },
  { key: "venues.manage", description: "Consola del local: dashboard operativo, arriendos y cartas" },
] as const;

export const ROLE_GRANTS: Record<string, string[]> = {
  STAFF: ["checkins.write", "social.manage"],
  PRODUCER: ["discounts.manage", "social.manage", "events.manage", "crm.manage"],
  ACADEMY_OWNER: ["academies.create", "crm.manage"],
  VENUE_MANAGER: ["venues.manage"],
  // ADMIN: isSuperuser - pasa todo sin grants explícitos
};

// Catálogo de estilos - data de producto, no demo (aplica a prod también).
export const STYLE_CATALOG = [
  { name: "Salsa cubana (casino)", genre: Genre.CUBANO },
  { name: "Salsa on1", genre: Genre.SALSA },
  { name: "Bachata sensual", genre: Genre.BACHATA },
  { name: "Bachata tradicional", genre: Genre.BACHATA },
  { name: "Bachata moderna", genre: Genre.BACHATA },
  { name: "Cubano", genre: Genre.CUBANO },
  { name: "Afrocubano", genre: Genre.CUBANO },
  { name: "Rueda de casino", genre: Genre.CUBANO },
  { name: "Timba", genre: Genre.CUBANO },
  { name: "Mambo on2", genre: Genre.SALSA },
  { name: "Fusión", genre: Genre.OTHER },
] as const;

// Catálogos de clases de academia - mantenibles desde /admin/catalogos.
export const CLASS_LEVEL_CATALOG = [
  { name: "Iniciación", order: 0 },
  { name: "Básico", order: 1 },
  { name: "Intermedio", order: 2 },
  { name: "Avanzado", order: 3 },
] as const;

export const CLASS_TYPE_CATALOG = [
  { name: "Pareja" },
  { name: "Shines" },
  { name: "Corporalidad" },
] as const;

// Defaults operativos - update:{} no pisa valores editados desde /admin.
export const PARAM_DEFAULTS: Array<{
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
  { key: "fees.managed_allin_pct", value: 10, description: "Comisión todo incluido sobre ventas gestionadas (%) - default global; cadena: override evento → default productor (platformFeePct) → este param" },
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
  { key: "crm.winback_days", value: 21, description: "Días sin actividad para que el trigger WINBACK dispare" },
  { key: "classes.cancel_refund_minutes", value: 60, description: "Minutos antes del inicio de la clase hasta los que cancelar devuelve el crédito de la cuota - después la reserva se puede cancelar pero la clase se pierde" },
  // ─── SaaS billing (spec academy-saas-billing) ───
  // Tiers de academia: límite de alumnos activos por tier (ENTERPRISE = sin límite, contratación manual).
  { key: "academy_tier.starter_max_students", value: 50, description: "Máximo de alumnos activos del tier STARTER de academia" },
  { key: "academy_tier.pro_max_students", value: 150, description: "Máximo de alumnos activos del tier PRO de academia" },
  { key: "academy_tier.studio_max_students", value: 400, description: "Máximo de alumnos activos del tier STUDIO de academia" },
  // Precios por tier y ciclo (CLP/mes): semestral −2%, anual −4% sobre el mensual.
  { key: "academy_tier.starter_monthly_clp", value: 49990, description: "Precio mensual tier STARTER de academia (CLP)" },
  { key: "academy_tier.starter_semiannual_clp", value: 48990, description: "Precio mensual cobrando semestral tier STARTER de academia (CLP)" },
  { key: "academy_tier.starter_annual_clp", value: 47990, description: "Precio mensual cobrando anual tier STARTER de academia (CLP)" },
  { key: "academy_tier.pro_monthly_clp", value: 99990, description: "Precio mensual tier PRO de academia (CLP)" },
  { key: "academy_tier.pro_semiannual_clp", value: 97990, description: "Precio mensual cobrando semestral tier PRO de academia (CLP)" },
  { key: "academy_tier.pro_annual_clp", value: 95990, description: "Precio mensual cobrando anual tier PRO de academia (CLP)" },
  { key: "academy_tier.studio_monthly_clp", value: 189990, description: "Precio mensual tier STUDIO de academia (CLP)" },
  { key: "academy_tier.studio_semiannual_clp", value: 185990, description: "Precio mensual cobrando semestral tier STUDIO de academia (CLP)" },
  { key: "academy_tier.studio_annual_clp", value: 181990, description: "Precio mensual cobrando anual tier STUDIO de academia (CLP)" },
  // Ciclo de facturación de academia: trial de onboarding, grace de
  // lanzamiento para las existentes y gracia por mora antes del bloqueo.
  { key: "academy_billing.trial_days", value: 30, description: "Días de trial de onboarding para academias nuevas (sin tarjeta upfront)" },
  { key: "academy_billing.migration_grace_days", value: 60, description: "Días de grace de lanzamiento para academias existentes al despliegue SaaS" },
  { key: "academy_billing.grace_days", value: 5, description: "Días calendario de gracia tras invoice impaga antes del bloqueo por mora" },
  // Tiers Producer Pro: límite de facturación mensual (media 90d) por tier (PRO_BIG = a convenir).
  { key: "producer_tier.starter_max_monthly_clp", value: 2500000, description: "Facturación mensual máxima del tier PRO_STARTER (CLP)" },
  { key: "producer_tier.growth_max_monthly_clp", value: 8000000, description: "Facturación mensual máxima del tier PRO_GROWTH (CLP)" },
  { key: "producer_tier.starter_monthly_clp", value: 99990, description: "Precio mensual tier PRO_STARTER (CLP)" },
  { key: "producer_tier.starter_semiannual_clp", value: 97990, description: "Precio mensual cobrando semestral tier PRO_STARTER (CLP)" },
  { key: "producer_tier.starter_annual_clp", value: 95990, description: "Precio mensual cobrando anual tier PRO_STARTER (CLP)" },
  { key: "producer_tier.growth_monthly_clp", value: 249990, description: "Precio mensual tier PRO_GROWTH (CLP)" },
  { key: "producer_tier.growth_semiannual_clp", value: 244990, description: "Precio mensual cobrando semestral tier PRO_GROWTH (CLP)" },
  { key: "producer_tier.growth_annual_clp", value: 239990, description: "Precio mensual cobrando anual tier PRO_GROWTH (CLP)" },
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
];

/** Catálogo de badges - las keys deben coincidir con BadgeAwarder (gamification/rules.ts). */
export const BADGE_CATALOG = [
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

  // Depuración del catálogo (la limpieza que se hizo a mano en prod):
  // "Salsa on2" y "Bachata dominicana" salieron de STYLE_CATALOG pero
  // DBs ya pobladas conservan las filas. Acá se eliminan con sus
  // referencias personales; las referencias estructurales (series,
  // bloques de horario, sesiones) quedan desvinculadas (null).
  const REMOVED_STYLES = ["Salsa on2", "Bachata dominicana"];
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

  console.log(
    `  baseline: ${ROLE_CATALOG.length} roles, ${PERMISSION_CATALOG.length} permisos, ${STYLE_CATALOG.length} estilos, ${BADGE_CATALOG.length} badges, ${PARAM_DEFAULTS.length} params`,
  );
}
