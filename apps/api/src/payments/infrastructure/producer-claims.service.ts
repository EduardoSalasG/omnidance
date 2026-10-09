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
import { decodeSeriesPassRef } from "../domain/order-ref";

export const CLAIM_FOLDER = "claims";
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const PRODUCER_METHOD_TYPES = [
  "TRANSFER",
  "PAYMENT_LINK",
  "CASH",
] as const;
export type ProducerMethodType = (typeof PRODUCER_METHOD_TYPES)[number];

/**
 * Métodos propios del productor + cola de comprobantes (spec
 * producer-own-methods). A diferencia de PaymentClaim (academia: el
 * claim CREA el pago al aprobarse), el TicketClaim adjunta evidencia a
 * un Payment PENDING gateway MANUAL ya creado en el checkout - al
 * aprobar, la orden se liquida por el MISMO settle del webhook
 * (tickets, mesa, redención, ledger, notificaciones). La comisión
 * devengada (OWN_METHOD) se netea en el payout del productor.
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
    const producerId = await this.producerOf(payment);

    let methodType: string = "TRANSFER";
    let methodLabel = "Otro";
    if (dto.methodId) {
      const method = await this.prisma.producerPaymentMethod.findFirst({
        where: { id: dto.methodId, producerId },
      });
      if (!method) throw new NotFoundException("método no encontrado");
      methodType = method.type;
      methodLabel = method.label;
    }

    const receiptKey = await this.storage.save(
      file,
      `${CLAIM_FOLDER}/${producerId}`,
    );

    const claim = await this.prisma.ticketClaim.create({
      data: {
        paymentId: payment.id,
        personId,
        producerId,
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
    await this.notifications.notifySafe(producerId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_new",
      title: `Comprobante por validar: ${person?.name ?? "un comprador"}`,
      body: `$${payment.amount.toLocaleString("es-CL")} · ${methodLabel}`,
      data: { claimId: claim.id, paymentId: payment.id },
    });

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
      where: { id: claimId, producerId },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
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
      actor: "person",
    });

    await this.notifications.notifySafe(claim.personId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_approved",
      title: "Pago validado",
      body: "Tu comprobante fue aprobado y tu entrada quedó emitida.",
      data: { claimId: claim.id, paymentId: claim.paymentId },
    });
    return { claim: { ...claim, status: "APPROVED" }, settled };
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
      where: { id: claimId, producerId },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
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

  // ── Comprobante (evidencia privada) ────────────────────────────────

  /** Claim + receiptKey para el stream autenticado; el controller decide
   *  si el viewer es el comprador dueño o el productor. */
  async loadClaimForReceipt(claimId: string) {
    const claim = await this.prisma.ticketClaim.findUnique({
      where: { id: claimId },
      select: { id: true, personId: true, producerId: true, receiptKey: true },
    });
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  assertCanView(
    claim: { personId: string; producerId: string },
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
