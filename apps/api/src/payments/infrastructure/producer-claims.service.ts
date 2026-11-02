import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClaimStatus, Payment } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import {
  extForMime,
  STORAGE,
  type FileStorage,
  type StoredFile,
} from "../../storage/storage.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { PaymentSettlementService } from "../application/payment-settlement.service";
import {
  decodeMembershipRef,
  decodePlatformSubRef,
  decodeSeriesPassRef,
} from "../domain/order-ref";

const CLAIM_FOLDER = "claims";
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const PRODUCER_METHOD_TYPES = [
  "TRANSFER",
  "PAYMENT_LINK",
  "CASH",
] as const;
type ProducerMethodType = (typeof PRODUCER_METHOD_TYPES)[number];

// Dominio de revisión del claim (spec subscription-manual-transfer):
// PRODUCER = métodos propios del productor (cola /producer/claims);
// ACADEMY = orden MEMBERSHIP manual de suscripción (la valida la
// academia en /academies/:id/order-claims); PLATFORM = orden
// PLATFORM_SUB manual (la valida admin en /admin/payment-claims).
export type ClaimDomain = "PRODUCER" | "ACADEMY" | "PLATFORM";

/**
 * Métodos propios del productor + cola de comprobantes (spec
 * producer-own-methods). A diferencia de PaymentClaim (academia: el
 * claim CREA el pago al aprobarse), el TicketClaim adjunta evidencia a
 * un Payment PENDING gateway MANUAL ya creado en el checkout - al
 * aprobar, la orden se liquida por el MISMO settle del webhook
 * (tickets, mesa, redención, ledger, notificaciones). La comisión
 * devengada (OWN_METHOD) se netea en el payout del productor.
 *
 * El mismo mecanismo cubre las suscripciones manuales por
 * transferencia (spec subscription-manual-transfer): las órdenes
 * `mem_*_manual_*`/`platsub_*_manual_*` aceptan comprobante, pero su
 * cola de validación es por dominio - la academia revisa las de
 * membresía y admin plataforma las de PLATFORM_SUB.
 */
@Injectable()
export class ProducerClaimsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settlement: PaymentSettlementService,
    @Inject(STORAGE) private readonly storage: FileStorage,
  ) {}

  // ── Medios de pago ─────────────────────────────────────────────────

  listMethods(producerId: string, opts: { includeInactive?: boolean } = {}) {
    return this.prisma.producerPaymentMethod.findMany({
      where: {
        producerId,
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
    producerId: string,
    dto: { type: string; label: string; details: unknown; order?: number },
  ) {
    this.assertMethodType(dto.type);
    return this.prisma.producerPaymentMethod.create({
      data: {
        producerId,
        type: dto.type,
        label: dto.label,
        details: dto.details as object,
        order: dto.order ?? 0,
      },
    });
  }

  async updateMethod(
    producerId: string,
    methodId: string,
    dto: {
      label?: string;
      details?: unknown;
      order?: number;
      active?: boolean;
    },
  ) {
    const method = await this.prisma.producerPaymentMethod.findFirst({
      where: { id: methodId, producerId },
    });
    if (!method) throw new NotFoundException("método no encontrado");
    return this.prisma.producerPaymentMethod.update({
      where: { id: methodId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.details !== undefined ? { details: dto.details as object } : {}),
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async deleteMethod(producerId: string, methodId: string) {
    const method = await this.prisma.producerPaymentMethod.findFirst({
      where: { id: methodId, producerId },
    });
    if (!method) throw new NotFoundException("método no encontrado");
    await this.prisma.producerPaymentMethod.delete({
      where: { id: methodId },
    });
    return { ok: true };
  }

  private assertMethodType(
    type: string,
  ): asserts type is ProducerMethodType {
    if (!PRODUCER_METHOD_TYPES.includes(type as ProducerMethodType)) {
      throw new BadRequestException(
        `type inválido: ${type} (${PRODUCER_METHOD_TYPES.join("|")})`,
      );
    }
  }

  // ── Claims del comprador ───────────────────────────────────────────

  /**
   * Adjunta el comprobante a una orden propia. Solo órdenes MANUAL
   * PENDING (creadas por checkout con methodId): una orden de pasarela
   * o ya resuelta no admite evidencia extra.
   */
  async createClaim(
    paymentId: string,
    personId: string,
    file: StoredFile,
    dto: { methodId?: string; note?: string },
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

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.personId !== personId) {
      // 404 deliberado: no revelar si la orden existe para otros.
      throw new NotFoundException("orden no encontrada");
    }
    if (payment.gateway !== "MANUAL" || payment.status !== "PENDING") {
      throw new ConflictException(
        "la orden no admite comprobante (no es de método propio o ya se resolvió)",
      );
    }
    // Dominio de revisión de la orden (spec subscription-manual-transfer):
    // la cola depende del orderType, no de un único dueño.
    const target = await this.claimTarget(payment);

    let methodType: string = "TRANSFER";
    let methodLabel = "Otro";
    if (dto.methodId) {
      // El método declarado se valida en el catálogo del dominio:
      // ProducerPaymentMethod para PRODUCER, AcademyPaymentMethod para
      // ACADEMY. PLATFORM no tiene método seleccionable (los datos son
      // los params platform_billing.transfer.*).
      const method =
        target.domain === "ACADEMY"
          ? await this.prisma.academyPaymentMethod.findFirst({
              where: { id: dto.methodId, academyId: target.academyId },
            })
          : target.domain === "PRODUCER"
            ? await this.prisma.producerPaymentMethod.findFirst({
                where: { id: dto.methodId, producerId: target.producerId },
              })
            : null;
      if (!method) throw new NotFoundException("método no encontrado");
      methodType = method.type;
      methodLabel = method.label;
    }
    if (target.domain === "PLATFORM") {
      methodLabel = "Transferencia";
    }

    const receiptKey = await this.storage.save(
      file,
      `${CLAIM_FOLDER}/${target.folder}`,
    );

    const claim = await this.prisma.ticketClaim.create({
      data: {
        paymentId: payment.id,
        personId,
        producerId: target.producerId ?? null,
        domain: target.domain,
        academyId: target.academyId ?? null,
        receiptKey,
        methodType,
        methodLabel,
        note: dto.note ?? null,
      },
    });

    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { name: true },
    });
    const notice = {
      category: "TRANSACTIONAL" as const,
      type: "payment_claim_new",
      title: `Comprobante por validar: ${person?.name ?? "un comprador"}`,
      body: `$${payment.amount.toLocaleString("es-CL")} · ${methodLabel}`,
      data: { claimId: claim.id, paymentId: payment.id },
    };
    if (target.domain === "PLATFORM") {
      // Cola de admin plataforma: avisa a cada ADMIN aprobado (mismo
      // patrón que los avisos operativos del settle).
      const admins = await this.prisma.personRole.findMany({
        where: { role: "ADMIN", status: "APPROVED" },
        select: { personId: true },
      });
      for (const admin of admins) {
        await this.notifications.notifySafe(admin.personId, notice);
      }
    } else {
      await this.notifications.notifySafe(target.reviewerId, notice);
    }

    return claim;
  }

  /** Claims propios del comprador sobre una orden concreta. */
  listClaimsOfPayment(paymentId: string, personId: string) {
    return this.prisma.ticketClaim.findMany({
      where: { paymentId, personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        methodLabel: true,
        status: true,
        reviewNote: true,
        createdAt: true,
      },
    });
  }

  /** Productor dueño de la orden: TICKET → event.producerId; SERIES_PASS →
   *  serie del refId. Órdenes de academia/suscripción no pasan por acá. */
  private async producerOf(payment: Payment): Promise<string> {
    if (payment.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: payment.eventId },
        select: { producerId: true },
      });
      if (event?.producerId) return event.producerId;
    }
    const sp = decodeSeriesPassRef(payment.refId);
    if (sp) {
      const series = await this.prisma.eventSeries.findUnique({
        where: { id: sp.seriesId },
        select: { producerId: true },
      });
      if (series?.producerId) return series.producerId;
    }
    throw new BadRequestException(
      "la orden no pertenece a un productor con métodos propios",
    );
  }

  /**
   * Cola de revisión de la orden (spec subscription-manual-transfer):
   * - PRODUCER: TICKET/SERIES_PASS del checkout con método propio -
   *   valida el productor dueño (producerOf).
   * - ACADEMY: MEMBERSHIP manual de suscripción (`mem_<plan>_manual_*`)
   *   - valida la academia del plan (owner/staff con capacidad payments).
   * - PLATFORM: PLATFORM_SUB manual (`platsub_<sub>_manual_*`) - valida
   *   admin plataforma; no tiene dueño Person, la notificación va a los
   *   ADMIN aprobados.
   */
  private async claimTarget(payment: Payment): Promise<{
    domain: ClaimDomain;
    producerId?: string;
    academyId?: string;
    /** Destinatario del aviso de claim nuevo (admin va aparte). */
    reviewerId: string;
    /** Subcarpeta del comprobante en storage. */
    folder: string;
  }> {
    if (payment.orderType === "MEMBERSHIP") {
      const order = decodeMembershipRef(payment.refId);
      const plan = order
        ? await this.prisma.membershipPlan.findUnique({
            where: { id: order.planId },
            select: { academyId: true, academy: { select: { ownerId: true } } },
          })
        : null;
      if (!plan) {
        throw new BadRequestException(
          "la orden no pertenece a una academia con métodos propios",
        );
      }
      return {
        domain: "ACADEMY",
        academyId: plan.academyId,
        reviewerId: plan.academy.ownerId,
        folder: `academies/${plan.academyId}`,
      };
    }
    if (payment.orderType === "PLATFORM_SUB") {
      const order = decodePlatformSubRef(payment.refId);
      if (!order) {
        throw new BadRequestException(
          "la orden no pertenece a una suscripción de plataforma",
        );
      }
      return { domain: "PLATFORM", reviewerId: "", folder: "platform" };
    }
    const producerId = await this.producerOf(payment);
    return {
      domain: "PRODUCER",
      producerId,
      reviewerId: producerId,
      folder: producerId,
    };
  }

  // ── Cola del productor ─────────────────────────────────────────────

  /**
   * Cola del productor con filtros opcionales del contrato compartido
   * (spec analytics/query-console): `status` ya whitelisteado en el
   * controller, `from`/`to` sobre createdAt.
   */
  async listClaims(
    producerId: string,
    filter: { status?: ClaimStatus; from?: Date; to?: Date } = {},
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const where = {
      producerId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.ticketClaim.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        ...(pg ? { skip: pg.skip, take: pg.take } : {}),
        select: {
          id: true,
          methodType: true,
          methodLabel: true,
          status: true,
          note: true,
          reviewNote: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: { select: { id: true, name: true } },
          person: { select: { id: true, name: true } },
          payment: {
            select: { id: true, amount: true, orderType: true, refId: true },
          },
        },
      }),
      this.prisma.ticketClaim.count({ where }),
    ]);
    return {
      items,
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
    };
  }

  /**
   * Detalle de un comprobante de la cola del productor - misma forma del
   * item de listClaims más el refId de la orden y datos completos de
   * pago para la ficha (montos, canal, fecha de orden).
   */
  async claimDetail(producerId: string, claimId: string) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, producerId },
      select: {
        id: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        payment: {
          select: {
            id: true,
            amount: true,
            orderType: true,
            refId: true,
            channel: true,
            status: true,
            createdAt: true,
            gatewayPaidAt: true,
          },
        },
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  /**
   * Aprueba: flip atómico PENDING→APPROVED (dos aprobaciones
   * concurrentes serializan - la perdedora ve count=0) y luego el
   * settle de la orden por el mismo camino del webhook. El settle es
   * idempotente: si la orden ya estaba PAID no emite duplicado.
   */
  async approve(producerId: string, claimId: string, reviewerId: string) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, producerId, domain: "PRODUCER" },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveApprove(claim, reviewerId);
  }

  async reject(
    producerId: string,
    claimId: string,
    reviewerId: string,
    note: string,
  ) {
    if (!note?.trim()) {
      throw new BadRequestException("el motivo del rechazo es requerido");
    }
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, producerId, domain: "PRODUCER" },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveReject(claim, reviewerId, note);
  }

  /**
   * Núcleo de la aprobación, compartido por las tres colas de dominio
   * (spec subscription-manual-transfer): flip atómico PENDING→APPROVED +
   * settle de la orden por el mismo camino del webhook (actor "claim" -
   * para órdenes de suscripción el settle además activa la sub). El
   * comprador recibe el aviso de aprobación.
   */
  private async resolveApprove(
    claim: { id: string; status: string; paymentId: string; personId: string },
    reviewerId: string,
  ) {
    if (claim.status !== "PENDING") {
      throw new ConflictException("el comprobante ya fue resuelto");
    }
    const claimed = await this.prisma.ticketClaim.updateMany({
      where: { id: claim.id, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException("el comprobante ya fue resuelto");
    }

    const payment = await this.prisma.payment.findUniqueOrThrow({
      where: { id: claim.paymentId },
    });
    const settled = await this.settlement.settle(payment, "PAID", {
      actor: "claim",
    });

    await this.notifications.notifySafe(claim.personId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_approved",
      title: "Pago validado",
      body: "Tu comprobante fue aprobado y tu pago quedó confirmado.",
      data: { claimId: claim.id, paymentId: claim.paymentId },
    });
    return { claim: { ...claim, status: "APPROVED" }, settled };
  }

  /**
   * Núcleo del rechazo: el claim queda REJECTED con motivo obligatorio
   * y la orden sigue PENDING - el comprador puede subir un comprobante
   * nuevo sobre la misma orden (re-subida del spec).
   */
  private async resolveReject(
    claim: { id: string; status: string; paymentId: string; personId: string },
    reviewerId: string,
    note: string,
  ) {
    if (claim.status !== "PENDING") {
      throw new ConflictException("el comprobante ya fue resuelto");
    }
    const updated = await this.prisma.ticketClaim.update({
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
      data: { claimId: claim.id, paymentId: claim.paymentId },
    });
    return { claim: updated };
  }

  // ── Cola de la academia (órdenes MEMBERSHIP de suscripciones) ─────

  /**
   * Cola de comprobantes de órdenes de la academia (spec
   * subscription-manual-transfer): TicketClaim domain=ACADEMY. La
   * revisa owner/staff con capacidad payments (gate en el controller).
   */
  async listAcademyClaims(
    academyId: string,
    filter: { status?: ClaimStatus; from?: Date; to?: Date } = {},
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const where = {
      domain: "ACADEMY" as const,
      academyId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.ticketClaim.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        ...(pg ? { skip: pg.skip, take: pg.take } : {}),
        select: {
          id: true,
          methodType: true,
          methodLabel: true,
          status: true,
          note: true,
          reviewNote: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: { select: { id: true, name: true } },
          person: { select: { id: true, name: true } },
          payment: {
            select: { id: true, amount: true, orderType: true, refId: true },
          },
        },
      }),
      this.prisma.ticketClaim.count({ where }),
    ]);
    return {
      items,
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
    };
  }

  /** Detalle de un comprobante de la cola de la academia. */
  async academyClaimDetail(academyId: string, claimId: string) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "ACADEMY", academyId },
      select: {
        id: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        payment: {
          select: {
            id: true,
            amount: true,
            orderType: true,
            refId: true,
            channel: true,
            status: true,
            createdAt: true,
            gatewayPaidAt: true,
          },
        },
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  async approveAcademyClaim(
    academyId: string,
    claimId: string,
    reviewerId: string,
  ) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "ACADEMY", academyId },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveApprove(claim, reviewerId);
  }

  async rejectAcademyClaim(
    academyId: string,
    claimId: string,
    reviewerId: string,
    note: string,
  ) {
    if (!note?.trim()) {
      throw new BadRequestException("el motivo del rechazo es requerido");
    }
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "ACADEMY", academyId },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveReject(claim, reviewerId, note);
  }

  // ── Cola de plataforma (órdenes PLATFORM_SUB) ─────────────────────

  /** Cola admin de comprobantes de suscripciones de plataforma. */
  async listPlatformClaims(
    filter: { status?: ClaimStatus; from?: Date; to?: Date } = {},
    pg?: { page: number; pageSize: number; skip: number; take: number },
  ) {
    const where = {
      domain: "PLATFORM" as const,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lte: filter.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.ticketClaim.findMany({
        where,
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        ...(pg ? { skip: pg.skip, take: pg.take } : {}),
        select: {
          id: true,
          methodType: true,
          methodLabel: true,
          status: true,
          note: true,
          reviewNote: true,
          createdAt: true,
          reviewedAt: true,
          reviewedBy: { select: { id: true, name: true } },
          person: { select: { id: true, name: true } },
          payment: {
            select: { id: true, amount: true, orderType: true, refId: true },
          },
        },
      }),
      this.prisma.ticketClaim.count({ where }),
    ]);
    return {
      items,
      total,
      page: pg?.page ?? 1,
      pageSize: pg?.pageSize ?? total,
    };
  }

  /** Detalle de un comprobante de la cola de plataforma. */
  async platformClaimDetail(claimId: string) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "PLATFORM" },
      select: {
        id: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        reviewedBy: { select: { id: true, name: true } },
        person: { select: { id: true, name: true } },
        payment: {
          select: {
            id: true,
            amount: true,
            orderType: true,
            refId: true,
            channel: true,
            status: true,
            createdAt: true,
            gatewayPaidAt: true,
          },
        },
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  async approvePlatformClaim(claimId: string, reviewerId: string) {
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "PLATFORM" },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveApprove(claim, reviewerId);
  }

  async rejectPlatformClaim(
    claimId: string,
    reviewerId: string,
    note: string,
  ) {
    if (!note?.trim()) {
      throw new BadRequestException("el motivo del rechazo es requerido");
    }
    const claim = await this.prisma.ticketClaim.findFirst({
      where: { id: claimId, domain: "PLATFORM" },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return this.resolveReject(claim, reviewerId, note);
  }

  // ── Comprobante (evidencia privada) ────────────────────────────────

  /** Claim + receiptKey para el stream autenticado; el controller decide
   *  si el viewer es el comprador dueño o el productor. */
  async loadClaimForReceipt(claimId: string) {
    const claim = await this.prisma.ticketClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        personId: true,
        producerId: true,
        domain: true,
        academyId: true,
        receiptKey: true,
      },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  assertCanView(
    claim: { personId: string; producerId: string | null },
    viewerId: string,
    isAdmin: boolean,
  ) {
    if (
      !isAdmin &&
      claim.personId !== viewerId &&
      claim.producerId !== viewerId
    ) {
      throw new ForbiddenException();
    }
  }

  readReceipt(receiptKey: string) {
    return this.storage.read(receiptKey);
  }
}
