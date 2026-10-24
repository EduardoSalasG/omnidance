import { Injectable } from "@nestjs/common";
import type { AcademyPromo } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { promoChargeClp } from "../domain/academy-promos";

/** Promo con sus scopes ya cargados (planes por id + personas por id). */
export type AcademyPromoWithScope = AcademyPromo & {
  plans: { id: string }[];
  persons: { id: string }[];
};

const SCOPE_INCLUDE = {
  plans: { select: { id: true } },
  persons: { select: { id: true } },
} as const;

/**
 * Resolución de promos de membresía de academia (spec member-promos) -
 * única fuente de verdad para "qué promo aplica a este alumno en este
 * plan hoy". La usan el checkout de membresía (pago único y quote), el
 * claim de método propio y el motor de suscripciones recurrentes
 * (subscribe, customer-return y el drift-check del reconcile).
 *
 * Reglas: enabled + ventana [validFrom, validUntil] + plan en scope
 * (lista vacía = todos los planes de la academia) + alumno en whitelist
 * (vacía = cualquier persona, inscrita o no → preventa) + maxCycles no
 * agotado por conteo de Payment PAID marcados del alumno. Si varias
 * promos califican gana la de mayor ahorro sobre el cobro; empate → la
 * que vence antes (determinista).
 */
@Injectable()
export class AcademyPromosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cobros PAID del alumno marcados con la promo - el conteo que agota
   * maxCycles. Por (persona, promo): cancelar y resuscribirse, cambiar
   * de plan dentro del scope o mezclar pago único con suscripción no
   * resetean el beneficio (mismo criterio anti-reset que PlatformPromo
   * aplica por actor).
   */
  async usedCycles(personId: string, promoId: string): Promise<number> {
    return this.prisma.payment.count({
      where: {
        academyPromoId: promoId,
        personId,
        status: "PAID",
      },
    });
  }

  /**
   * Promo vigente aplicable al alumno para un plan y un cargo base.
   * `chargeClp` = precio del plan (MembershipPlan.price); con null se
   * compara el descriptor nominal del descuento (vistas sin monto).
   */
  async resolveApplicable(
    academyId: string,
    personId: string,
    planId: string,
    chargeClp: number | null,
  ): Promise<AcademyPromoWithScope | null> {
    const now = new Date();
    const promos = await this.prisma.academyPromo.findMany({
      where: {
        academyId,
        enabled: true,
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
      include: SCOPE_INCLUDE,
    });
    let best: { promo: AcademyPromoWithScope; saved: number } | null = null;
    for (const promo of promos) {
      if (promo.plans.length > 0 && !promo.plans.some((p) => p.id === planId)) {
        continue;
      }
      if (
        promo.persons.length > 0 &&
        !promo.persons.some((p) => p.id === personId)
      ) {
        continue;
      }
      if (promo.maxCycles != null) {
        const used = await this.usedCycles(personId, promo.id);
        if (used >= promo.maxCycles) continue;
      }
      const saved =
        chargeClp != null
          ? chargeClp - promoChargeClp(chargeClp, promo)
          : promo.discountType === "PERCENT"
            ? (promo.percentOff ?? 0)
            : (promo.amountOffClp ?? 0);
      if (
        !best ||
        saved > best.saved ||
        (saved === best.saved && promo.validUntil < best.promo.validUntil)
      ) {
        best = { promo, saved };
      }
    }
    return best?.promo ?? null;
  }

  /**
   * Descriptor de la promo aplicable para la vista del alumno (quote de
   * checkout): la promo que aplicaría el cobro hoy + ciclos restantes.
   * `finalClp` = total ya descontado (lo que la pasarela cobra).
   */
  async applicableView(
    academyId: string,
    personId: string,
    planId: string,
    chargeClp: number,
  ) {
    const promo = await this.resolveApplicable(
      academyId,
      personId,
      planId,
      chargeClp,
    );
    if (!promo) return null;
    const used =
      promo.maxCycles != null
        ? await this.usedCycles(personId, promo.id)
        : null;
    return {
      id: promo.id,
      name: promo.name,
      discountType: promo.discountType,
      percentOff: promo.percentOff,
      amountOffClp: promo.amountOffClp,
      validUntil: promo.validUntil,
      cyclesLeft:
        promo.maxCycles != null && used != null
          ? Math.max(0, promo.maxCycles - used)
          : null,
      finalClp: promoChargeClp(chargeClp, promo),
    };
  }
}
