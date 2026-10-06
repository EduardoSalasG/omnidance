import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { ClaimStatus, PlanType } from "@prisma/client";
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

export const CLAIM_FOLDER = "claims";
export const CLAIM_MAX_BYTES = 5 * 1024 * 1024; // 5MB
export const CLAIM_METHOD_TYPES = [
  "TRANSFER",
  "PAYMENT_LINK",
  "CASH",
] as const;
export type ClaimMethodType = (typeof CLAIM_METHOD_TYPES)[number];

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
    if (dto.methodId) {
      const method = await this.prisma.academyPaymentMethod.findFirst({
        where: { id: dto.methodId, academyId },
      });
      if (!method) throw new NotFoundException("método no encontrado");
      methodType = method.type as ClaimMethodType;
      methodLabel = method.label;
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
      body: `${academy.name} · $${dto.amount.toLocaleString("es-CL")}`,
      data: { academyId, claimId: claim.id },
    });

    return claim;
  }

  /** Cola de validación del owner, ordenada por antigüedad. */
  listClaims(academyId: string, status?: ClaimStatus) {
    return this.prisma.paymentClaim.findMany({
      where: { academyId, ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        amount: true,
        methodType: true,
        methodLabel: true,
        status: true,
        note: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        person: { select: { id: true, name: true } },
        plan: { select: { id: true, name: true, type: true } },
      },
    });
  }

  listMyClaims(academyId: string, personId: string) {
    return this.prisma.paymentClaim.findMany({
      where: { academyId, personId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        methodLabel: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        plan: { select: { name: true } },
      },
    });
  }

  // ── Validación ─────────────────────────────────────────────────────

  /**
   * Aprueba el claim en una transacción: Payment MANUAL PAID para el
   * libro, enrollment asegurado y endsAt extendido con la regla de
   * vigencia del webhook Flow. Claims no-PENDING → 409.
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

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderType: "MEMBERSHIP",
          refId: `claim-${claim.id}`,
          personId: claim.personId,
          amount: claim.amount,
          fee: 0,
          net: claim.amount,
          gateway: "MANUAL",
          status: "PAID",
        },
      });

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
      return { claim: updated, newEndsAt };
    });

    await this.notifications.notifySafe(claim.personId, {
      category: "TRANSACTIONAL",
      type: "payment_claim_approved",
      title: "Pago validado",
      body: claim.plan
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
    if (!claim) throw new NotFoundException("comprobante no encontrado");
    return claim;
  }

  readReceipt(receiptKey: string) {
    return this.storage.read(receiptKey);
  }
}
