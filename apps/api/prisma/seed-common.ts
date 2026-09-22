// Baseline compartida por seed-dev y seed-prod: catálogo RBAC, permisos,
// grants, estilos y parámetros de plataforma. Todo idempotente — upserts
// por clave natural; find-or-create donde el schema no tiene unique.
import { PrismaClient, Genre } from "@prisma/client";

// Catálogo RBAC vivo en DB. Los roles solo se asignan por admin
// (POST /admin/users/:personId/roles) — no hay auto-solicitud.
// isSuperuser: pasa todo check de permisos (solo ADMIN — no editable por API).
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
] as const;

export const ROLE_GRANTS: Record<string, string[]> = {
  STAFF: ["checkins.write", "social.manage"],
  PRODUCER: ["discounts.manage", "social.manage", "events.manage", "crm.manage"],
  ACADEMY_OWNER: ["academies.create", "crm.manage"],
  // ADMIN: isSuperuser — pasa todo sin grants explícitos
};

// Catálogo de estilos — data de producto, no demo (aplica a prod también).
export const STYLE_CATALOG = [
  { name: "Salsa cubana (casino)", genre: Genre.CUBANO },
  { name: "Salsa on2", genre: Genre.SALSA },
  { name: "Salsa on1", genre: Genre.SALSA },
  { name: "Bachata sensual", genre: Genre.BACHATA },
  { name: "Bachata dominicana", genre: Genre.BACHATA },
  { name: "Bachata tradicional", genre: Genre.BACHATA },
  { name: "Bachata moderna", genre: Genre.BACHATA },
  { name: "Cubano", genre: Genre.CUBANO },
  { name: "Afrocubano", genre: Genre.CUBANO },
  { name: "Rueda de casino", genre: Genre.CUBANO },
  { name: "Timba", genre: Genre.CUBANO },
  { name: "Mambo on2", genre: Genre.SALSA },
  { name: "Fusión", genre: Genre.OTHER },
] as const;

// Catálogos de clases de academia — mantenibles desde /admin/catalogos.
export const CLASS_LEVEL_CATALOG = [
  { name: "Iniciación", order: 0 },
  { name: "Básico", order: 1 },
  { name: "Intermedio", order: 2 },
  { name: "Avanzado", order: 3 },
] as const;

export const CLASS_TYPE_CATALOG = [
  { name: "En Pareja" },
  { name: "Shines" },
  { name: "Corporalidad" },
] as const;

// Defaults operativos — update:{} no pisa valores editados desde /admin.
export const PARAM_DEFAULTS: Array<{
  key: string;
  value: unknown;
  description: string;
}> = [
  { key: "service_fee.presale_clp", value: 500, description: "Cargo por servicio por ticket de preventa (CLP)" },
  { key: "service_fee.door_app_clp", value: 700, description: "Cargo por servicio venta en puerta por app (CLP)" },
  { key: "service_fee.door_cash_clp", value: 0, description: "Cargo por servicio registro en efectivo (CLP)" },
  { key: "session.cooldown_minutes", value: 4, description: "Minutos de cooldown entre sesiones del mismo par" },
  { key: "qr.rotation_seconds", value: 60, description: "Segundos de vigencia del QR personal rotativo" },
  { key: "prime_time.window_minutes", value: 30, description: "Minutos de la ventana Prime Time" },
  { key: "prime_time.threshold_pct", value: 0.2, description: "Umbral Prime Time como fracción del aforo" },
  { key: "early_checkin.cutoff_minutes", value: 1380, description: "Minutos desde medianoche — check-in antes de esta hora (23:00) cuenta como temprano (badge madrugador + puntos early_checkin)" },
  { key: "series_pass.price_clp", value: 25000, description: "Precio mensual del pase de serie (CLP) — fallback si la serie no define precio propio" },
  { key: "service_fee.series_pass_clp", value: 500, description: "Cargo por servicio del pase de serie (CLP)" },
  { key: "platform_fee.default_pct", value: 0, description: "Comisión de plataforma sobre ventas (%) — se descuenta del gross al liquidar; override por productor y por evento" },
  { key: "crm.winback_days", value: 21, description: "Días sin actividad para que el trigger WINBACK dispare" },
];

/** Catálogo de badges — las keys deben coincidir con BadgeAwarder (gamification/rules.ts). */
export const BADGE_CATALOG = [
  { key: "primera_bachata", name: "Primera bachata", category: "MILESTONE" },
  { key: "bailarin_constante", name: "Bailarín constante", category: "MILESTONE" },
  { key: "madrugador", name: "Madrugador", category: "CONDUCT" },
  { key: "maratonista", name: "Maratonista", category: "CONDUCT" },
  { key: "mariposa_social", name: "Mariposa social", category: "CONDUCT" },
  { key: "prime_time_crown", name: "Corona Prime Time", category: "TEMPORARY_STATUS" },
] as const;

/** Crea o confirma una persona con sus roles. Idempotente por email. */
export async function ensurePerson(
  prisma: PrismaClient,
  email: string,
  name: string,
  roles: Array<{ role: string; status?: "PENDING" | "SANDBOX" | "APPROVED" }>,
) {
  const person = await prisma.person.upsert({
    where: { email },
    update: { name },
    create: { email, name },
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

/** Baseline de plataforma — corre en dev y prod antes del dataset propio. */
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

  // ─── Estilos — find-or-create por nombre (sin unique en schema) ───
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

  // ─── Catálogos de clases (nivel/tipo) — upsert por nombre unique ───
  for (const l of CLASS_LEVEL_CATALOG) {
    await prisma.classLevel.upsert({
      where: { name: l.name },
      update: { order: l.order },
      create: l,
    });
  }
  // Rename "Pareja" → "En Pareja" (vocabulario del spec) — preserva el id
  // y los ClassSeriesType existentes; si ambos ya existen no choca unique.
  const legacyPareja = await prisma.classType.findUnique({
    where: { name: "Pareja" },
  });
  if (legacyPareja) {
    const enPareja = await prisma.classType.findUnique({
      where: { name: "En Pareja" },
    });
    if (!enPareja) {
      await prisma.classType.update({
        where: { id: legacyPareja.id },
        data: { name: "En Pareja" },
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

  // ─── Badges — catálogo para que BadgeAwarder pueda otorgar ───
  for (const b of BADGE_CATALOG) {
    await prisma.badge.upsert({
      where: { key: b.key },
      update: { name: b.name, category: b.category },
      create: b,
    });
  }

  // ─── Parámetros — nunca pisar valores editados en /admin ───
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
