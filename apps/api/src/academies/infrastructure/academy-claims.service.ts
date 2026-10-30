import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClaimStatus, PlanType, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import {
  extForMime,
  STORAGE,
  type FileStorage,
  type StoredFile,
} from "../../storage/storage.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import {
  membershipBase,
  membershipEndsAt,
} from "../../payments/domain/membership-vigency";
import { AcademyPromosService } from "../../payments/application/academy-promos.service";
import { promoChargeClp } from "../../payments/domain/academy-promos";

const CLAIM_FOLDER = "claims";
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Monto para copy de notificaciones (spec multipais-currency): CLP
 * sigue con el `$` de siempre; otra moneda se rotula con su código
 * ("EUR 12.000") para no confundir el símbolo con pesos.
 */
function claimMoney(amount: number, currency: string | null | undefined) {
  const cur = currency && currency.length === 3 ? currency : "CLP";
  const out = `$${amount.toLocaleString("es-CL")}`;
  return cur === "CLP" ? out : `${out} ${cur}`;
}
export const CLAIM_METHOD_TYPES = [
  "TRANSFER",
  "PAYMENT_LINK",
  "CASH",
] as const;
type ClaimMethodType = (typeof CLAIM_METHOD_TYPES)[number];

/**
 * Claims de pago directo (spec academy-payment-claims): el alumno sube
 * el comprobante de un pago hecho por fuera (transferencia, link MP,
 * efectivo) y el owner lo valida. Al aprobar, la vigencia se extiende
 * con la misma regla del webhook Flow (membershipBase + membershipEndsAt)
 * y queda un Payment gateway MANUAL en el libro - nunca entra a Payout.
 */
@Injectable()
export class AcademyClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE) private readonly storage: FileStorage,
    private readonly academyPromos: AcademyPromosService,
  ) {}

  // ── Medios de pago ─────────────────────────────────────────────────

  listMethods(academyId: string, opts: { includeInactive?: boolean } = {}) {
    return this.prisma.academyPaymentMethod.findMany({
      where: {
        academyId,
        ...(opts.includeInactive ? {} : { active: true }),
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        label: true,
        details: true,
        order: true,
        active: true,
      },
    });
  }

  async createMethod(
    academyId: string,
    dto: {
      type: string;
      label: string;
      details: unknown;
      order?: number;
    },
  ) {
    this.assertMethodType(dto.type);
    return this.prisma.academyPaymentMethod.create({
      data: {
        academyId,
        type: dto.type,
        label: dto.label,
        details: dto.details as object,
        order: dto.order ?? 0,
      },
    });
  }

  async updateMethod(
    academyId: string,
    methodId: string,
    dto: {
      label?: string;
      details?: unknown;
      order?: number;
      active?: boolean;
    },
  ) {
    const method = await this.prisma.academyPaymentMethod.findFirst({
      where: { id: methodId, academyId },
    });
    if (!method) throw new NotFoundException("método no encontrado");
    return this.prisma.academyPaymentMethod.update({
      where: { id: methodId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.details !== undefined ? { details: dto.details as object } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteMethod(academyId: string, methodId: string) {
    const method = await this.prisma.academyPaymentMethod.findFirst({
      where: { id: methodId, academyId },
    });
    if (!method) throw new NotFoundException("método no encontrado");
    await this.prisma.academyPaymentMethod.delete({
      where: { id: methodId },
    });
    return { ok: true };
  }

  private assertMethodType(type: string): asserts type is ClaimMethodType {
    if (!CLAIM_METHOD_TYPES.includes(type as ClaimMethodType)) {
      throw new BadRequestException(
        `type inválido: ${type} (${CLAIM_METHOD_TYPES.join("|")})`,
      );
    }
  }

  // ── Claims del alumno ──────────────────────────────────────────────

  /**
   * Moneda de la academia (spec multipais-currency): la del país de su
   * ciudad; sin ciudad → CLP. El claim la snapshottea al declarar.
   */
  private async academyCurrency(academyId: string): Promise<string> {
    const a = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        city: { select: { country: { select: { currency: true } } } },
      },
    });
    return a?.city?.country?.currency ?? "CLP";
  }

  /**
   * Intento de pago del checkout (spec academy-checkout-manual-pay y
   * private-class-checkout): el alumno elige el medio de la academia y
   * el intento queda registrado como claim AWAITING, sin comprobante
   * todavía. Si sale de la app y vuelve, el checkout lo reanuda. Una
   * sola forma por llamada: {planId} para membresía o {privateClass:
   * true} para la particular. Idempotente: un AWAITING o PENDING vivo
   * se devuelve tal cual (por person+plan en PLAN, por person+kind en
   * PRIVATE_CLASS).
   */
  async createIntent(
    academyId: string,
    personId: string,
    dto: { planId?: string; privateClass?: boolean; methodId: string },
  ) {
    const method = await this.prisma.academyPaymentMethod.findFirst({
      where: { id: dto.methodId, academyId, active: true },
    });
    if (!method) throw new NotFoundException("método no encontrado");
    if (dto.privateClass === true) {
      if (dto.planId) {
        throw new BadRequestException(
          "planId y privateClass son excluyentes",
        );
      }
      return this.createPrivateClassIntent(academyId, personId, method);
    }
    if (!dto.planId) {
      throw new BadRequestException("planId o privateClass son requeridos");
    }
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: dto.planId, academyId, active: true },
      select: { id: true, name: true, price: true, currency: true },
    });
    if (!plan) throw new NotFoundException("plan no encontrado");

    const existing = await this.prisma.paymentClaim.findFirst({
      where: {
        academyId,
        personId,
        planId: plan.id,
        status: { in: ["AWAITING", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        academyId,
        personId,
        status: { in: ["ACTIVE", "TRIAL", "ONLINE", "PAUSED", "FROZEN"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    // Promo vigente de la academia para este alumno/plan (spec
    // member-promos): el intento declara el precio con descuento y
    // queda marcado - el Payment MANUAL al aprobar hereda la promo para
    // el conteo de maxCycles.
    const promo = await this.academyPromos.resolveApplicable(
      academyId,
      personId,
      plan.id,
      plan.price,
      plan.currency ?? "CLP",
    );

    return this.prisma.paymentClaim.create({
      data: {
        academyId,
        personId,
        enrollmentId: enrollment?.id ?? null,
        planId: plan.id,
        kind: "PLAN",
        // Snapshot del precio vigente: el intento declara pagar el
        // plan, no un monto libre (a diferencia del claim "suelto").
        amount: promo ? promoChargeClp(plan.price, promo) : plan.price,
        currency: plan.currency ?? "CLP",
        academyPromoId: promo?.id ?? null,
        methodId: method.id,
        methodType: method.type,
        methodLabel: method.label,
        status: "AWAITING",
      },
    });
  }

  /**
   * Intento de clase particular por método propio (spec
   * private-class-checkout): la academia debe vender particulares con
   * la misma regla del checkout de pasarela (activa, privateLessonPrice
   * > 0, sin bloqueo por mora); mismos estados: inexistente 404,
   * bloqueada o sin venta 400. El claim nace kind PRIVATE_CLASS con
   * planId null, amount = privateLessonPrice en snapshot y sin promo
   * (las promos de academia aplican solo a planes). Idempotente por
   * person+kind: no hay planId que discrimine, la particular es una
   * sola por academia.
   */
  private async createPrivateClassIntent(
    academyId: string,
    personId: string,
    method: { id: string; type: string; label: string },
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        id: true,
        active: true,
        privateLessonPrice: true,
        billingBlockedAt: true,
      },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");
    if (academy.billingBlockedAt != null) {
      throw new BadRequestException(
        "la academia no está disponible por el momento",
      );
    }
    if (!academy.active || !academy.privateLessonPrice) {
      throw new BadRequestException(
        "la academia no vende clases particulares",
      );
    }

    const existing = await this.prisma.paymentClaim.findFirst({
      where: {
        academyId,
        personId,
        kind: "PRIVATE_CLASS",
        status: { in: ["AWAITING", "PENDING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        academyId,
        personId,
        status: { in: ["ACTIVE", "TRIAL", "ONLINE", "PAUSED", "FROZEN"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    return this.prisma.paymentClaim.create({
      data: {
        academyId,
        personId,
        enrollmentId: enrollment?.id ?? null,
        planId: null,
        kind: "PRIVATE_CLASS",
        // Snapshot del precio de lista: la particular es un producto
        // único de la academia, sin cargo de servicio en método propio.
        amount: academy.privateLessonPrice,
        currency: await this.academyCurrency(academyId),
        methodId: method.id,
        methodType: method.type,
        methodLabel: method.label,
        status: "AWAITING",
      },
    });
  }

  /**
   * Adjunta el comprobante a un claim AWAITING propio → PENDING en la
   * cola del owner. Es la transición que hace el intento accionable.
   */
  async attachReceipt(
    academyId: string,
    claimId: string,
    personId: string,
    file: StoredFile,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("comprobante requerido");
    }
    if (file.size > CLAIM_MAX_BYTES) {
      throw new BadRequestException("el archivo supera 5MB");
    }
    if (!extForMime(file.mimetype)) {
      throw new BadRequestException(
        "formato no soportado (solo imagen o PDF)",
      );
    }
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId, personId },
    });
    if (!claim) throw new NotFoundException("intento no encontrado");
    if (claim.status !== "AWAITING") {
      throw new ConflictException("el intento ya tiene comprobante");
    }
    const receiptKey = await this.storage.save(
      file,
      `${CLAIM_FOLDER}/${academyId}`,
    );
    const updated = await this.prisma.paymentClaim.update({
      where: { id: claim.id },
      data: { receiptKey, status: "PENDING" },
    });

    const [academy, person] = await Promise.all([
      this.prisma.academy.findUnique({
        where: { id: academyId },
        select: { name: true, ownerId: true },
      }),
      this.prisma.person.findUnique({
        where: { id: personId },
        select: { name: true },
      }),
    ]);
    if (academy) {
      await this.notifications.notifySafe(academy.ownerId, {
        category: "TRANSACTIONAL",
        type: "payment_claim_new",
        title: `Comprobante por validar: ${person?.name ?? "un alumno"}`,
        body: `${academy.name} · ${claimMoney(claim.amount, claim.currency)}`,
        data: { academyId, claimId: claim.id },
      });
    }
    return updated;
  }

  /**
   * Cancela un intento AWAITING propio (borrador sin efecto financiero
   * ni comprobante - no queda registro porque nunca fue accionable).
   */
  async cancel(academyId: string, claimId: string, personId: string) {
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId, personId },
    });
    if (!claim) throw new NotFoundException("intento no encontrado");
    if (claim.status !== "AWAITING") {
      throw new ConflictException("solo se cancela un intento sin comprobante");
    }
    await this.prisma.paymentClaim.delete({ where: { id: claim.id } });
    return { ok: true };
  }

  /**
   * Persiste el comprobante y crea el claim PENDING enlazado al
   * enrollment vigente del alumno si existe. Notifica al owner.
   */
  async createClaim(
    academyId: string,
    personId: string,
    file: StoredFile,
    dto: {
      planId?: string;
      amount: number;
      methodId?: string;
      note?: string;
    },
    academy: { name: string; ownerId: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("comprobante requerido");
    }
    if (file.size > CLAIM_MAX_BYTES) {
      throw new BadRequestException("el archivo supera 5MB");
    }
    if (!extForMime(file.mimetype)) {
      throw new BadRequestException(
        "formato no soportado (solo imagen o PDF)",
      );
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException("amount debe ser > 0");
    }

    let methodType: ClaimMethodType | null = null;
    let methodLabel = "Otro";
    let methodId: string | null = null;
    if (dto.methodId) {
      const method = await this.prisma.academyPaymentMethod.findFirst({
        where: { id: dto.methodId, academyId },
      });
      if (!method) throw new NotFoundException("método no encontrado");
      methodType = method.type as ClaimMethodType;
      methodLabel = method.label;
      methodId = method.id;
    }

    let plan: { id: string; name: string } | null = null;
    if (dto.planId) {
      plan = await this.prisma.membershipPlan.findFirst({
        where: { id: dto.planId, academyId, active: true },
        select: { id: true, name: true },
      });
      if (!plan) throw new NotFoundException("plan no encontrado");
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        academyId,
        personId,
        status: { in: ["ACTIVE", "TRIAL", "ONLINE", "PAUSED", "FROZEN"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const receiptKey = await this.storage.save(
      file,
      `${CLAIM_FOLDER}/${academyId}`,
    );

    const claim = await this.prisma.paymentClaim.create({
      data: {
        academyId,
        personId,
        enrollmentId: enrollment?.id ?? null,
        planId: plan?.id ?? null,
        amount: dto.amount,
        currency: await this.academyCurrency(academyId),
        methodId,
        methodType: methodType ?? "TRANSFER",
        methodLabel,
        receiptKey,
        note: dto.note ?? null,
      },
    });

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { name: true },
    });
    await this.notifications.notifySafe(academy.ownerId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_new",
      title: `Comprobante por validar: ${person?.name ?? "un alumno"}`,
      body: `${academy.name} · ${claimMoney(dto.amount, claim.currency)}`,
      data: { academyId, claimId: claim.id },
    });

    return claim;
  }

  /**
   * Cola de validación del owner, ordenada por antigüedad. Paginada
   * (spec academy-console-v3): responde {items,total,page,pageSize}.
   */
  async listClaims(
    academyId: string,
    status?: ClaimStatus,
    createdAt?: { gte?: Date; lte?: Date },
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const where = {
      academyId,
      ...(status ? { status } : {}),
      ...(createdAt ? { createdAt } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.paymentClaim.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        ...(pg ? { skip: pg.skip, take: pg.take } : {}),
      select: {
        id: true,
        // kind distingue el producto del claim (spec
        // private-class-checkout): PRIVATE_CLASS tiene planId null y la
        // cola la rotula "Clase particular".
        kind: true,
        amount: true,
        currency: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        // AWAITING = intento sin comprobante todavía (checkout manual):
        // la cola lo muestra como seguimiento, no accionable.
        receiptKey: true,
        // Auditoría (spec academy-staff-roles): con varios revisando,
        // el owner ve quién aprobó/rechazó cada comprobante.
        reviewedBy: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, type: true } },
      },
      }),
      this.prisma.paymentClaim.count({ where }),
    ]);
    return {
      items,
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
    };
  }

  /**
   * GET /academies/:id/billing-report - reporte de cobranza (spec
   * academy-tier-v2): el piso del tier COBROS, disponible en todos los
   * tiers. Une las dos fuentes del libro de la academia - claims de
   * pago directo (cualquier estado) y pagos PAID/pasarela atribuidos
   * por refId (mem_<planId>_ membresías, wks_<classId>_ clases
   * sueltas/talleres, pvt_<academyId>_ particulares; los `claim-*` de
   * claims aprobados NO entran: ya están representados por su claim).
   *
   * Filtros del contrato compartido: from/to por día sobre createdAt,
   * planId (claims por columna; pagos solo membresía por refId) y
   * status por vocabulario nativo de cada fuente (el caller valida la
   * whitelist). Agregados `billed`/`payers`/`topPlan` describen lo
   * COBRADO del subconjunto filtrado (Payment PAID + claim APPROVED);
   * `items` respeta todos los filtros y pagina el merge por fecha.
   */
  async billingReport(
    academyId: string,
    opts: {
      createdAt?: { gte?: Date; lte?: Date };
      planId?: string;
      status?: string;
      pg: { page: number; pageSize: number; skip: number; take: number };
    },
  ) {
    const [plans, classes] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where: { academyId },
        select: { id: true, name: true },
      }),
      this.prisma.class.findMany({
        where: { slot: { academyId } },
        select: { id: true },
      }),
    ]);
    const planName = new Map(plans.map((p) => [p.id, p.name]));

    // Pagos por pasarela adjudicados a la academia por prefijo de refId
    // (mismo decode+belongs que /payments/by-academy y cobrosKpis).
    const PAYMENT_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED"];
    const payWhere: Prisma.PaymentWhereInput = {
      orderType: { in: ["MEMBERSHIP", "WORKSHOP", "PRIVATE"] },
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      // Con filtro de plan solo las membresías llevan planId en el refId.
      OR: opts.planId
        ? [
            {
              orderType: "MEMBERSHIP",
              refId: { startsWith: `mem_${opts.planId}_` },
            },
          ]
        : [
            ...plans.map((p) => ({
              orderType: "MEMBERSHIP" as const,
              refId: { startsWith: `mem_${p.id}_` },
            })),
            ...classes.map((c) => ({
              orderType: "WORKSHOP" as const,
              refId: { startsWith: `wks_${c.id}_` },
            })),
            {
              orderType: "PRIVATE" as const,
              refId: { startsWith: `pvt_${academyId}_` },
            },
          ],
      ...(opts.status && PAYMENT_STATUSES.includes(opts.status)
        ? { status: opts.status as "PENDING" | "PAID" | "FAILED" | "REFUNDED" }
        : {}),
    };
    const CLAIM_STATUSES = ["PENDING", "AWAITING", "APPROVED", "REJECTED"];
    const claimWhere: Prisma.PaymentClaimWhereInput = {
      academyId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.planId ? { planId: opts.planId } : {}),
      ...(opts.status && CLAIM_STATUSES.includes(opts.status)
        ? { status: opts.status as ClaimStatus }
        : {}),
    };

    const [payments, claims] = await Promise.all([
      this.prisma.payment.findMany({
        where: payWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          personId: true,
          amount: true,
          currency: true,
          status: true,
          orderType: true,
          refId: true,
          gateway: true,
          gatewayMedia: true,
          methodLabel: true,
          createdAt: true,
        },
      }),
      this.prisma.paymentClaim.findMany({
        where: claimWhere,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          personId: true,
          amount: true,
          currency: true,
          status: true,
          methodLabel: true,
          createdAt: true,
          person: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
        },
      }),
    ]);

    // Nombres de pagantes de la vía pasarela (claims traen el join).
    const personIds = [
      ...new Set([
        ...payments.map((p) => p.personId),
        ...claims.map((c) => c.personId),
      ]),
    ];
    const people = personIds.length
      ? await this.prisma.person.findMany({
          where: { id: { in: personIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(people.map((p) => [p.id, p.name]));

    type Row = {
      id: string;
      kind: "PAYMENT" | "CLAIM";
      personId: string;
      personName: string | null;
      planId: string | null;
      planName: string | null;
      amount: number;
      /** ISO-4217 del cobro (spec multipais-currency). */
      currency: string;
      status: string;
      method: string | null;
      createdAt: string;
    };
    const rows: Row[] = [
      ...payments.map((p) => {
        // mem_<planId>_<ref> - decodifica el plan de la membresía.
        const planId = p.refId.startsWith("mem_")
          ? p.refId.split("_")[1]
          : null;
        return {
          id: p.id,
          kind: "PAYMENT" as const,
          personId: p.personId,
          personName: nameOf.get(p.personId) ?? null,
          planId,
          planName: planId ? (planName.get(planId) ?? null) : null,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          method: p.gatewayMedia ?? p.methodLabel ?? p.gateway,
          createdAt: p.createdAt.toISOString(),
        };
      }),
      ...claims.map((c) => ({
        id: c.id,
        kind: "CLAIM" as const,
        personId: c.personId,
        personName: c.person.name ?? nameOf.get(c.personId) ?? null,
        planId: c.plan?.id ?? null,
        planName: c.plan?.name ?? null,
        amount: c.amount,
        currency: c.currency,
        status: c.status,
        method: c.methodLabel,
        createdAt: c.createdAt.toISOString(),
      })),
    ].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Agregados sobre lo efectivamente cobrado del subconjunto filtrado.
    const collected = rows.filter((r) =>
      r.kind === "PAYMENT" ? r.status === "PAID" : r.status === "APPROVED",
    );
    const billed = collected.reduce((a, r) => a + r.amount, 0);
    const payers = new Set(collected.map((r) => r.personId)).size;
    const byPlan = new Map<string, { name: string; count: number; amount: number }>();
    for (const r of collected) {
      if (!r.planId) continue;
      const cur = byPlan.get(r.planId) ?? {
        name: r.planName ?? "",
        count: 0,
        amount: 0,
      };
      cur.count += 1;
      cur.amount += r.amount;
      byPlan.set(r.planId, cur);
    }
    const top =
      [...byPlan.entries()].sort(
        (a, b) => b[1].count - a[1].count || b[1].amount - a[1].amount,
      )[0] ?? null;

    return {
      billed,
      payers,
      topPlan: top
        ? { planId: top[0], name: top[1].name, count: top[1].count, amount: top[1].amount }
        : null,
      items: rows.slice(opts.pg.skip, opts.pg.skip + opts.pg.take),
      total: rows.length,
      page: opts.pg.page,
      pageSize: opts.pg.pageSize,
    };
  }

  /** Detalle de un claim de la cola (owner/staff con capacidad payments). */
  async getClaim(academyId: string, claimId: string) {
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId },
      select: {
        id: true,
        kind: true,
        amount: true,
        currency: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        receiptKey: true,
        paymentId: true,
        enrollmentId: true,
        reviewedBy: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, type: true, price: true } },
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    // El pago MANUAL creado al aprobar: su refId es la "transacción" del
    // cobro en el detalle (claim-<claimId>).
    const payment = claim.paymentId
      ? await this.prisma.payment.findUnique({
          where: { id: claim.paymentId },
          select: {
            id: true,
            refId: true,
            status: true,
            channel: true,
            createdAt: true,
          },
        })
      : null;
    return { ...claim, payment };
  }

  listMyClaims(academyId: string, personId: string) {
    return this.prisma.paymentClaim.findMany({
      where: { academyId, personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        // kind en cada claim (spec private-class-checkout): el panel
        // de pago manual reanuda el intento vivo por planId (PLAN) o por
        // kind PRIVATE_CLASS según el producto en checkout.
        kind: true,
        amount: true,
        currency: true,
        methodType: true,
        methodLabel: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        // planId + methodId planos: el checkout reanuda el intento
        // AWAITING/PENDING del plan que está comprando con los datos
        // vigentes del método elegido.
        planId: true,
        methodId: true,
        plan: { select: { name: true } },
      },
    });
  }

  // ── Validación ─────────────────────────────────────────────────────

  /**
   * Aprueba el claim en una transacción: Payment MANUAL PAID para el
   * libro, enrollment asegurado y endsAt extendido con la regla de
   * vigencia del webhook Flow. Claims no-PENDING → 409.
   * Un claim PRIVATE_CLASS cambia la orden a PRIVATE y materializa la
   * PrivateLesson "por asignar" (misma materialización que el settle
   * PRIVATE de la pasarela: REQUESTED, sin instructor ni fecha).
   */
  async approve(academyId: string, claimId: string, reviewerId: string) {
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId },
      include: {
        plan: { select: { id: true, type: true, periodDays: true } },
        enrollment: { select: { id: true, endsAt: true } },
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    if (claim.status !== "PENDING") {
      throw new ConflictException("el comprobante ya fue resuelto");
    }
    const isPrivateClass = claim.kind === "PRIVATE_CLASS";

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          // Los claims sueltos legacy (planId null, kind PLAN) siguen
          // entrando como MEMBERSHIP, como antes del campo kind.
          orderType: isPrivateClass ? "PRIVATE" : "MEMBERSHIP",
          refId: `claim-${claim.id}`,
          personId: claim.personId,
          amount: claim.amount,
          // Promo declarada en el intento (spec member-promos) - marca
          // el cobro descontado para auditoría y conteo de maxCycles.
          academyPromoId: claim.academyPromoId ?? null,
          fee: 0,
          net: claim.amount,
          currency: claim.currency ?? "CLP",
          gateway: "MANUAL",
          status: "PAID",
          // Modelo SaaS (spec producer-fee-model): sin comisión y sin
          // pasarela (plata cobrada por método propio) - se marca en el
          // libro; el payout ACADEMY excluye MANUAL del gross.
          feeMode: "ACADEMY",
          platformFeeNetClp: 0,
          platformFeeVatClp: 0,
          gatewayFeeExpected: 0,
          producerNetClp: claim.amount,
        },
      });

      // La particular aprobada materializa la clase "por asignar" en
      // la misma tx: REQUESTED, sin instructor ni fecha (el owner los
      // define después). Espejo de settlePrivateLesson del settle de
      // pasarela; el price es el monto cobrado porque en método propio
      // no hay cargo de servicio separado.
      let lessonId: string | null = null;
      if (isPrivateClass) {
        const lesson = await tx.privateLesson.create({
          data: {
            academyId,
            personId: claim.personId,
            instructorId: null,
            scheduledAt: null,
            price: claim.amount,
            commissionPct: 0,
            paymentId: payment.id,
            status: "REQUESTED",
          },
        });
        lessonId = lesson.id;
      }

      let enrollmentId = claim.enrollmentId;
      let newEndsAt: Date | null = null;
      if (claim.plan) {
        const plan = {
          type: claim.plan.type as PlanType,
          periodDays: claim.plan.periodDays,
        };
        if (enrollmentId) {
          const enrollment = await tx.enrollment.findUniqueOrThrow({
            where: { id: enrollmentId },
            select: { endsAt: true },
          });
          const base = membershipBase(now, enrollment.endsAt);
          newEndsAt = membershipEndsAt(plan, base);
          await tx.enrollment.update({
            where: { id: enrollmentId },
            data: {
              endsAt: newEndsAt,
              status: "ACTIVE",
              // El plan declarado en el claim manda: puede diferir del de
              // la inscripción (upgrade/downgrade cobrado por fuera).
              planId: claim.plan.id,
            },
          });
        } else {
          const base = membershipBase(now, null);
          newEndsAt = membershipEndsAt(plan, base);
          const created = await tx.enrollment.create({
            data: {
              academyId,
              personId: claim.personId,
              planId: claim.plan.id,
              status: "ACTIVE",
              endsAt: newEndsAt,
            },
          });
          enrollmentId = created.id;
        }
      }

      const updated = await tx.paymentClaim.update({
        where: { id: claim.id },
        data: {
          status: "APPROVED",
          reviewedById: reviewerId,
          reviewedAt: now,
          paymentId: payment.id,
          ...(enrollmentId && !claim.enrollmentId
            ? { enrollmentId }
            : {}),
        },
      });
      return { claim: updated, newEndsAt, lessonId };
    });

    await this.notifications.notifySafe(claim.personId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_approved",
      title: "Pago validado",
      body: isPrivateClass
        ? "Tu comprobante fue aprobado: la academia asignará fecha e instructor de tu clase particular."
        : claim.plan
          ? "Tu comprobante fue aprobado y tu plan quedó al día."
          : "Tu comprobante fue aprobado.",
      data: { academyId, claimId: claim.id },
    });

    return result;
  }

  async reject(
    academyId: string,
    claimId: string,
    reviewerId: string,
    note: string,
  ) {
    if (!note?.trim()) {
      throw new BadRequestException("el motivo del rechazo es requerido");
    }
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    if (claim.status !== "PENDING") {
      throw new ConflictException("el comprobante ya fue resuelto");
    }
    const updated = await this.prisma.paymentClaim.update({
      where: { id: claim.id },
      data: {
        status: "REJECTED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        reviewNote: note.trim(),
      },
    });
    await this.notifications.notifySafe(claim.personId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_rejected",
      title: "Comprobante rechazado",
      body: note.trim(),
      data: { academyId, claimId: claim.id },
    });
    return { claim: updated };
  }

  // ── Comprobante (evidencia privada) ────────────────────────────────

  /** claim + receiptKey si el viewer puede verlo; null → 404/403 afuera. */
  async loadClaimForReceipt(academyId: string, claimId: string) {
    const claim = await this.prisma.paymentClaim.findFirst({
      where: { id: claimId, academyId },
      select: { id: true, personId: true, receiptKey: true },
    });
    if (!claim?.receiptKey) {
      throw new NotFoundException("comprobante no encontrado");
    }
    // Devuelve receiptKey ya narrowed a string (AWAITING no tiene).
    return {
      id: claim.id,
      personId: claim.personId,
      receiptKey: claim.receiptKey,
    };
  }

  readReceipt(receiptKey: string) {
    return this.storage.read(receiptKey);
  }
}
