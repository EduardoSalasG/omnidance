// Módulos del hub /academia y su filtro de visibilidad (spec
// academy-tier-gates-refine): cada card exige la capability del
// miembro (`cap`) Y la feature del tier de la academia seleccionada
// (`feature`, misma regla que AcademyTierGate y el 403 tier.required
// del API). Staff de COBROS no ve módulos que solo llevan a paywall.
//
// Sin `feature` = módulo del piso (COBROS) o superficie transversal:
// `clases` es la consola del instructor por persona y cross-academia
// (no se gatea por el tier de la academia seleccionada); planes,
// promos, alumnos, cobros, configuración y suscripción son
// cobranza/perfil - base de todos los tiers.

import {
  academyHasFeature,
  type AcademyTrialShape,
} from "./academy-features";
import type { FeatureFlagsMap } from "./features-context";
import type {
  AcademyAccessInfo,
  AcademyCap,
} from "@/components/academy/use-academy-access";

export type HubModule = {
  href: string;
  /** Clave de `academy.modules.*` para título y descripción. */
  key: string;
  /** Capability de staff requerida (spec academy-staff-roles). */
  cap?: AcademyCap;
  /** Feature del tier de la academia (spec academy-tier-cobros). */
  feature?: string;
  /** Flag de funcionalidad del catálogo (spec feature-flags-admin):
      OFF/ausente oculta la card para todos los tiers - adicional al
      gate de `feature`, nunca lo reemplaza. */
  flag?: string;
  /** Fuera de la grilla del instructor puro. */
  noInstructor?: boolean;
  /** Solo owner de la academia o ADMIN de plataforma. */
  ownerOnly?: boolean;
};

export const HUB_MODULES: readonly HubModule[] = [
  { href: "/academia/clases", key: "myClasses" },
  { href: "/academia/planes", key: "plans", cap: "plans" },
  // Promos de membresía (spec member-promos): misma cap que planes -
  // herramienta de precio en todos los tiers, sin gate de feature.
  { href: "/academia/promos", key: "promos", cap: "plans" },
  { href: "/academia/alumnos", key: "students" },
  { href: "/academia/series", key: "series", cap: "schedule", feature: "classes" },
  // Particulares sale de la navegación del instructor puro (spec
  // staff-roles) - queda para owner/staff/admin.
  {
    href: "/academia/particulares",
    key: "lessons",
    noInstructor: true,
    feature: "classes",
  },
  {
    href: "/academia/videos",
    key: "videos",
    cap: "schedule",
    feature: "videos",
    flag: "academy_videos",
  },
  { href: "/academia/cobros", key: "payments", cap: "payments" },
  // Preventa por comisión (spec academy-presale-commission) - misma cap
  // que cobros: la respuesta al acuerdo es una decisión de payments.
  {
    href: "/academia/preventas",
    key: "presales",
    cap: "payments",
    feature: "presales",
  },
  { href: "/academia/equipo", key: "team", cap: "team", feature: "staff" },
  { href: "/academia/configuracion", key: "config", cap: "profile" },
  // CRM con actorType=ACADEMY: sigue owner/ADMIN-only (requireAdminister
  // del backend - no es delegable por flags) y exige `crm` (PRO).
  { href: "/crm", key: "crm", ownerOnly: true, feature: "crm" },
  {
    href: "/academia/configuracion/suscripcion",
    key: "subscription",
    cap: "billing",
  },
];

/**
 * Cards visibles del hub: la grilla se muestra solo a no-owner
 * (staff/instructor/ADMIN; el owner es redirigido a /inicio), así que
 * `access` ya viene resuelto. El filtro por `cap` replica lo que el API
 * exige por endpoint; el filtro por `feature` anticipa el 403
 * tier.required - sin él un staff de COBROS vería cards muertas.
 */
export function visibleHubModules({
  access,
  academy,
  flags,
  viewerId,
  viewerRoles,
  academyOwnerId,
}: {
  access: AcademyAccessInfo;
  academy: AcademyTrialShape;
  /** Mapa público de flags (useFeatures). Fail-closed: mientras el
      fetch resuelve llega {} y las cards con `flag` no pintan. */
  flags: FeatureFlagsMap;
  viewerId?: string;
  viewerRoles?: string[];
  academyOwnerId: string;
}): HubModule[] {
  const operational =
    access.isOwner || access.isAdmin || access.isInstructor || access.isStaff;

  // Instructor puro (sin staff/admin/owner en la academia): los módulos
  // marcados noInstructor no van en su grilla.
  const pureInstructor =
    access.isInstructor && !access.isStaff && !access.isAdmin && !access.isOwner;

  return HUB_MODULES.filter((m) => {
    if (m.noInstructor && pureInstructor) return false;
    if (m.ownerOnly) {
      const ownerOrAdmin =
        access.isAdmin === true ||
        access.isOwner === true ||
        viewerRoles?.includes("ADMIN") === true ||
        viewerId === academyOwnerId;
      if (!ownerOrAdmin) return false;
    } else if (m.cap) {
      if (access.caps[m.cap] !== true) return false;
    } else if (!operational) {
      return false;
    }
    // Gate por flag de funcionalidad (además de cap y tier): módulo
    // apagado a nivel plataforma no sale en la grilla para nadie.
    if (m.flag && flags[m.flag] !== true) return false;
    // Gate por tier (además de cap): staff de COBROS no ve módulos que
    // solo llevarían al TierPaywall - mismo criterio que el nav owner.
    if (m.feature && !academyHasFeature(academy, m.feature)) return false;
    return true;
  });
}
