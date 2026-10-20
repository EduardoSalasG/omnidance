// Checklist de validación de actor (spec rbac + cola admin): mismo
// criterio para el admin (/admin/validation-queue) y para el propio
// actor (GET /me/role-checks) - una sola verdad, sin duplicar.

export interface RoleProfileChecks {
  /** Nombre real - no el default del alta por magic link (prefijo del email). */
  name: boolean;
  /** Correo verificado (verifiedAt estampado por link/OTP). */
  emailVerified: boolean;
  /** Teléfono de contacto. */
  phone: boolean;
  /** Datos del actor ya operados: owner → ≥1 academia; productor → ≥1 evento. */
  actorData: boolean;
}

export function roleProfileChecks(
  p: {
    name: string;
    email: string | null;
    phone: string | null;
    verifiedAt: Date | null;
  },
  role: string,
  academiesCount: number,
  eventsCount: number,
): RoleProfileChecks {
  return {
    name:
      p.name.trim().length >= 2 && !(p.email?.startsWith(p.name) ?? false),
    emailVerified: p.verifiedAt !== null,
    phone: !!p.phone,
    actorData:
      role === "ACADEMY_OWNER" ? academiesCount > 0 : eventsCount > 0,
  };
}
