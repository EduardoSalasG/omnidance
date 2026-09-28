import { BadRequestException, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Payment, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodeSeriesPassRef,
  decodeTicketOrderRef,
} from "../domain/order-ref";
import {
  membershipBase,
  membershipEndsAt,
} from "../domain/membership-vigency";
import { emitPaymentEvent } from "../domain/payment-ledger";
import { sanitizeGatewayPayload } from "../infrastructure/gateway-transactions.service";
import { ParamsService } from "../../params/params.service";
import { effectiveCapacity } from "../../academies/domain/academy.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { SERVICE_FEE } from "@omnidance/shared";

/**
 * Contexto del settle: quién lo originó y la evidencia de la pasarela.
 * - actor: "webhook" | "polling" | "cron" | "admin" | "system" |
 *   "person" | "reconcile" — queda en la columna actor de cada
 *   PaymentEvent (vocabulario completo en el comentario del schema).
 * - gatewayData: `paymentData` de payment/getStatus (Flow) — verdad
 *   monetaria reportada por la pasarela; se persiste en los campos
 *   gateway* del Payment cuando el estado confirmado es PAID.
 * - kind "renewal": el pago proviene de un cobro de suscripción (T6/T7)
 *   → el evento de liquidación se emite como RENEWAL_SETTLED en vez de
 *   SETTLED.
 */
export interface SettleMeta {
  actor: string;
  gatewayData?: unknown;
  kind?: "renewal";
}

export interface SettleResult {
  ok: boolean;
  status: string;
  duplicated?: boolean;
}

/** Los 5 campos gateway* de Payment + el mismatch derivado. */
interface GatewayFields {
  gatewayFeeClp: number | null;
  gatewayReportedAmount: number | null;
  gatewayMedia: string | null;
  gatewayPaidAt: Date | null;
  gatewayRaw: Prisma.InputJsonValue;
}

interface AmountMismatch {
  expected: number;
  reported: number;
}

/**
 * paymentData de Flow es un objeto plano; cualquier campo ausente o con
 * tipo inesperado queda en null — nunca se inventa un valor. Si
 * gatewayData no es objeto (p.ej. StubGateway no lo envía) devuelve null
 * y el update no toca los campos gateway*.
 */
function extractGatewayFields(gatewayData: unknown): GatewayFields | null {
  if (gatewayData == null || typeof gatewayData !== "object") return null;
  const pd = gatewayData as Record<string, unknown>;
  const asInt = (v: unknown): number | null => {
    if (typeof v === "string" && v.trim() === "") return null;
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const paidAtRaw = pd.transferDate;
  const paidAtDate =
    paidAtRaw instanceof Date
      ? paidAtRaw
      : typeof paidAtRaw === "string"
        ? new Date(paidAtRaw)
        : null;
  return {
    gatewayFeeClp: asInt(pd.fee),
    gatewayReportedAmount: asInt(pd.amount),
    gatewayMedia: typeof pd.media === "string" ? pd.media : null,
    gatewayPaidAt:
      paidAtDate && !Number.isNaN(paidAtDate.getTime()) ? paidAtDate : null,
    gatewayRaw: gatewayData as Prisma.InputJsonValue,
  };
}

/**
 * Liquidación de pagos confirmados por la pasarela — extraído del
 * PaymentsController (webhook). Lo llaman el webhook (notificación
 * pasiva), getPayment (consulta activa en sandbox/dev) y el reconcile de
 * suscripciones (T6/T7 vía settleMembership).
 *
 * Idempotente: un pago ya PAID retorna `duplicated` sin emitir eventos ni
 * efectos; dentro de cada tx hay un re-check de status que cubre carreras
 * de webhooks concurrentes. Los eventos del ledger (STATUS_CONFIRMED,
 * SETTLED/RENEWAL_SETTLED, FAILED, AMOUNT_MISMATCH) se emiten SOLO en la
 * transición real de estado — una re-notificación no llena el ledger.
 */
@Injectable()
export class PaymentSettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * WEBHOOK_RECEIVED — evidencia append-only de CADA notificación que
   * llega de la pasarela, duplicadas incluidas (una re-notificación es
   * evidencia válida aunque no produzca transición). Va en su propia tx
   * (separa de la del settle, que corre después): el advisory lock del
   * ledger necesita contexto transaccional para serializar emisores
   * concurrentes. Si el payment no existe no hay paymentId para el
   * ledger y el webhook sigue respondiendo 404.
   */
  async recordWebhookReceived(
    payment: Payment,
    input: { remoteStatus: "PAID" | "FAILED"; body: unknown },
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      emitPaymentEvent(tx, payment.id, "WEBHOOK_RECEIVED", "webhook", {
        refId: payment.refId,
        remoteStatus: input.remoteStatus,
        body: (sanitizeGatewayPayload(input.body ?? null) ??
          null) as Prisma.InputJsonValue,
      }),
    );
  }

  /**
   * Liquida el pago según el estado confirmado por la pasarela.
   */
  async settle(
    payment: Payment,
    status: "PAID" | "FAILED",
    meta: SettleMeta,
  ): Promise<SettleResult> {
    // ya PAID → idempotente (re-notificación de la pasarela)
    if (payment.status === "PAID") {
      return { ok: true, status: "PAID" as const, duplicated: true };
    }

    if (status === "FAILED") {
      // La notificación y los eventos solo salen en la transición real
      // (PENDING → FAILED); una re-notificación FAILED es un no-op.
      let failedNow = false;
      await this.prisma.$transaction(async (tx) => {
        // Claim atómico PENDING→FAILED: dos notificaciones concurrentes
        // serializan sobre la fila y el perdedor ve count=0 (el re-check
        // por lectura no servía — bajo READ COMMITTED ambos leían
        // PENDING antes del commit del ganador y duplicaban el settle).
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: "PENDING" },
          data: { status: "FAILED" },
        });
        if (claimed.count === 0) return;
        failedNow = true;

        await emitPaymentEvent(tx, payment.id, "STATUS_CONFIRMED", meta.actor, {
          remoteStatus: "FAILED",
          gatewayRef: payment.gatewayRef ?? null,
        });
        await emitPaymentEvent(tx, payment.id, "FAILED", meta.actor, {
          orderType: payment.orderType,
          refId: payment.refId,
        });
      });

      if (failedNow) {
        const failedEvent = payment.eventId
          ? await this.prisma.event.findUnique({
              where: { id: payment.eventId },
              select: { name: true, startsAt: true },
            })
          : null;
        await this.notifications.notifySafe(payment.personId, {
          category: "TRANSACTIONAL",
          type: "payment.failed",
          title: "Tu pago no pudo procesarse",
          body: failedEvent ? `Para ${failedEvent.name}` : undefined,
          data: {
            paymentId: payment.id,
            refId: payment.refId,
            eventId: payment.eventId,
            eventName: failedEvent?.name ?? null,
            eventStartsAt: failedEvent?.startsAt?.toISOString() ?? null,
          },
        });
      }
      return { ok: true, status: "FAILED" };
    }

    // SERIES_PASS: rama separada del flujo ticket. A diferencia del ticket,
    // la orden no tiene contexto en columnas (Payment.eventId es null por
    // diseño — el pase es de la serie, no de un evento): el (seriesId, month)
    // viaja codificado en el refId y se decodifica como fuente primaria.
    if (payment.orderType === "SERIES_PASS") {
      return this.settleSeriesPass(payment, meta);
    }

    // MEMBERSHIP: igual que el pase, el contexto solo viaja en el refId —
    // el settle decodifica el plan y materializa/renueva el Enrollment.
    if (payment.orderType === "MEMBERSHIP") {
      return this.settleMembership(payment, meta);
    }

    // WORKSHOP (clase suelta / taller pago): refId wks_<classId>_<uuid>;
    // el asiento pagado se materializa como ClassBooking con paymentId.
    if (payment.orderType === "WORKSHOP") {
      return this.settleClassDropin(payment, meta);
    }

    return this.settleTicket(payment, meta);
  }

  /**
   * STATUS_CONFIRMED + AMOUNT_MISMATCH + SETTLED/RENEWAL_SETTLED dentro de
   * la tx de liquidación (solo se llama cuando la transición es real).
   * Devuelve el mismatch detectado para que el caller notifique a admin
   * fuera de la tx.
   */
  private async emitSettleEvents(
    tx: Prisma.TransactionClient,
    payment: Payment,
    meta: SettleMeta,
    gw: GatewayFields | null,
    detail: Record<string, unknown>,
  ): Promise<AmountMismatch | null> {
    await emitPaymentEvent(tx, payment.id, "STATUS_CONFIRMED", meta.actor, {
      remoteStatus: "PAID",
      gatewayRef: payment.gatewayRef ?? null,
    });
    let mismatch: AmountMismatch | null = null;
    if (
      gw?.gatewayReportedAmount != null &&
      gw.gatewayReportedAmount !== payment.amount
    ) {
      mismatch = {
        expected: payment.amount,
        reported: gw.gatewayReportedAmount,
      };
      await emitPaymentEvent(tx, payment.id, "AMOUNT_MISMATCH", meta.actor, {
        expected: mismatch.expected,
        reported: mismatch.reported,
      });
    }
    await emitPaymentEvent(
      tx,
      payment.id,
      meta.kind === "renewal" ? "RENEWAL_SETTLED" : "SETTLED",
      meta.actor,
      { orderType: payment.orderType, amount: payment.amount, ...detail },
    );
    return mismatch;
  }

  /**
   * Aviso OPERATIONAL a los ADMIN aprobados cuando Flow reporta un monto
   * distinto al de la orden (mismo patrón que leads → notifySafe por
   * personId). Fuera de la tx: la evidencia ya quedó en AMOUNT_MISMATCH.
   */
  private async notifyAdminsAmountMismatch(
    payment: Payment,
    mismatch: AmountMismatch,
  ): Promise<void> {
    const admins = await this.prisma.personRole.findMany({
      where: { role: "ADMIN", status: "APPROVED" },
      select: { personId: true },
    });
    for (const admin of admins) {
      await this.notifications.notifySafe(admin.personId, {
        category: "OPERATIONAL",
        type: "payment.amount_mismatch",
        title: "La pasarela reportó un monto distinto al de la orden",
        body: `Pago ${payment.refId}: esperado $${mismatch.expected} · reportado $${mismatch.reported}`,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          expected: mismatch.expected,
          reported: mismatch.reported,
        },
      });
    }
  }

  /**
   * Liquidación TICKET: el contexto de la compra vive en columnas
   * (Payment.eventId/discountCodeId); refId queda solo como correlación
   * con la pasarela. Fallback al decode para pagos legacy sin columnas.
   */
  private async settleTicket(
    payment: Payment,
    meta: SettleMeta,
  ): Promise<SettleResult> {
    const order = payment.eventId
      ? { eventId: payment.eventId, codeId: payment.discountCodeId }
      : decodeTicketOrderRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden ticket");
    }

    // fee parametrizable: se lee ANTES de abrir la tx (usa this.prisma, no
    // tx). Override admin del evento → PlatformParam → env → default shared.
    // El evento también se reutiliza dentro de la tx para el quote/ticket.
    const event = await this.prisma.event.findUnique({
      where: { id: order.eventId },
      select: {
        presalePrice: true,
        serviceFeeClp: true,
        name: true,
        startsAt: true,
        producerId: true,
      },
    });
    const serviceFeeClp =
      event?.serviceFeeClp ??
      (await this.params.getNumber(
        "service_fee.presale_clp",
        Number(process.env.SERVICE_FEE_CLP ?? SERVICE_FEE.PRESALE_CLP),
      ));

    // Verdad monetaria de la pasarela (Flow paymentData) — se persiste
    // junto al PAID dentro de la tx.
    const gw = extractGatewayFields(meta.gatewayData);

    // la notificación solo sale si esta llamada fue la que marcó PAID
    // (no en re-notificaciones ni carreras perdidas dentro de la tx)
    let paidNow = false;
    let reservationCreated = false;
    let mismatch: AmountMismatch | null = null;
    await this.prisma.$transaction(async (tx) => {
      // Claim atómico →PAID: dos webhooks concurrentes serializan sobre
      // la fila; el perdedor ve count=0 y sale sin emitir eventos ni
      // ticket. Reemplaza el read-check-update que bajo READ COMMITTED
      // leía PENDING en ambos y doble-liquida(va).
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "PAID" } },
        data: { status: "PAID", ...(gw ?? {}) },
      });
      if (claimed.count === 0) return;
      paidNow = true;

      mismatch = await this.emitSettleEvents(tx, payment, meta, gw, {
        eventId: order.eventId,
        quantity: payment.quantity,
      });

      // el ticket SOLO se emite cuando el pago queda PAID.
      // Economía unitaria: la orden la desnormalizó al checkout
      // (unitListPrice/unitServiceFee cubren preventa y puerta app);
      // pagos legacy sin columnas caen al re-derive por presalePrice.
      const code = order.codeId
        ? await tx.discountCode.findUnique({ where: { id: order.codeId } })
        : null;
      const unitListPrice =
        payment.unitListPrice ?? event?.presalePrice ?? 0;
      const unitServiceFee = payment.unitServiceFee ?? serviceFeeClp;

      // Multi-entrada: un ticket para el comprador + uno por destinatario
      // de regalo (ownerId=amigo, giftedFromId=comprador). El descuento se
      // audita una sola vez — solo el ticket del comprador lo referencia.
      const recipientIds = Array.isArray(payment.recipients)
        ? (payment.recipients as string[]).filter(
            (id): id is string => typeof id === "string",
          )
        : [];
      await tx.ticket.create({
        data: {
          eventId: order.eventId,
          ownerId: payment.personId,
          buyerId: payment.personId,
          paymentId: payment.id,
          listPrice: unitListPrice,
          serviceFee: unitServiceFee,
          discountCodeId: code?.id ?? null,
        },
      });
      for (const ownerId of recipientIds) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ownerId,
            buyerId: payment.personId,
            giftedFromId: payment.personId,
            paymentId: payment.id,
            listPrice: unitListPrice,
            serviceFee: unitServiceFee,
          },
        });
      }

      // Reclamables: entradas sobrantes de la orden quedan del comprador
      // con claimToken — el destinatario las reclama en /reclamar/:token
      // aunque no esté registrado ni sea amigo.
      const unassigned = Math.max(
        0,
        payment.quantity - 1 - recipientIds.length,
      );
      for (let i = 0; i < unassigned; i++) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            ownerId: payment.personId,
            buyerId: payment.personId,
            paymentId: payment.id,
            claimToken: randomBytes(16).toString("hex"),
            listPrice: unitListPrice,
            serviceFee: unitServiceFee,
          },
        });
      }

      // Reserva de mesa del checkout (spec §13): la intención viajó en
      // Payment.tablePartySize y se materializa solo con el pago PAID.
      // Dedup: una activa por persona/evento (como el POST standalone).
      if (payment.tablePartySize) {
        const existingReservation = await tx.tableReservation.findFirst({
          where: {
            eventId: order.eventId,
            personId: payment.personId,
            status: { in: ["REQUESTED", "CONFIRMED"] },
          },
          select: { id: true },
        });
        if (!existingReservation) {
          await tx.tableReservation.create({
            data: {
              eventId: order.eventId,
              personId: payment.personId,
              partySize: payment.tablePartySize,
              status: "REQUESTED",
            },
          });
          reservationCreated = true;
        }
      }

      if (code) {
        // auditoría de la redemption + consumo del uso
        await tx.discountRedemption.create({
          data: {
            codeId: code.id,
            personId: payment.personId,
            paymentId: payment.id,
          },
        });
        await tx.discountCode.update({
          where: { id: code.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    });

    if (paidNow) {
      const clp = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(payment.amount);
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.paid",
        title: "Pago confirmado — tu ticket está listo",
        body: event
          ? `${event.name} · ${payment.quantity} entrada${payment.quantity > 1 ? "s" : ""} · ${clp}`
          : `${payment.quantity} entrada${payment.quantity > 1 ? "s" : ""} · ${clp}`,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          eventId: order.eventId,
          eventName: event?.name ?? null,
          eventStartsAt: event?.startsAt?.toISOString() ?? null,
          quantity: payment.quantity,
          amount: payment.amount,
        },
      });

      // Aviso al productor: nueva solicitud de mesa desde el checkout
      // (solo si efectivamente se creó — no en dedup de reserva activa).
      if (reservationCreated && event?.producerId) {
        const buyer = await this.prisma.person.findUnique({
          where: { id: payment.personId },
          select: { name: true },
        });
        await this.notifications.notifySafe(event.producerId, {
          category: "TRANSACTIONAL",
          type: "table.requested",
          title: "Nueva solicitud de mesa",
          body: `${buyer?.name ?? "Un asistente"} · ${payment.tablePartySize} personas · ${event.name}`,
          data: {
            paymentId: payment.id,
            eventId: order.eventId,
            eventName: event.name,
            partySize: payment.tablePartySize,
            personId: payment.personId,
          },
        });
      }

      // Aviso a cada destinatario de regalo: quién la compró + qué evento.
      const recipientIds = Array.isArray(payment.recipients)
        ? (payment.recipients as string[]).filter(
            (id): id is string => typeof id === "string",
          )
        : [];
      if (recipientIds.length) {
        const buyer = await this.prisma.person.findUnique({
          where: { id: payment.personId },
          select: { name: true },
        });
        const buyerName = buyer?.name ?? "Un amigo";
        for (const ownerId of recipientIds) {
          await this.notifications.notifySafe(ownerId, {
            category: "TRANSACTIONAL",
            type: "ticket.gifted",
            title: `${buyerName} te regaló una entrada`,
            body: event?.name
              ? `Para ${event.name} — ya está en Mis entradas`
              : "Ya está en Mis entradas",
            data: {
              paymentId: payment.id,
              refId: payment.refId,
              eventId: order.eventId,
              eventName: event?.name ?? null,
              eventStartsAt: event?.startsAt?.toISOString() ?? null,
              buyerId: payment.personId,
              buyerName,
            },
          });
        }
      }

      if (mismatch) {
        await this.notifyAdminsAmountMismatch(payment, mismatch);
      }
    }

    return { ok: true, status: "PAID" };
  }

  /**
   * Liquidación del pase de serie al PAID: marca el Payment y hace upsert del
   * SeriesPass por @@unique([seriesId,personId,month]) — re-pago del mismo mes
   * solo refresca el precio, nunca duplica. Idempotente: re-notificación PAID
   * sale antes (ramal "duplicated") y el re-check dentro de la tx cubre
   * carreras; la notificación solo sale cuando esta llamada marcó PAID.
   */
  private async settleSeriesPass(
    payment: Payment,
    meta: SettleMeta,
  ): Promise<SettleResult> {
    const order = decodeSeriesPassRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden series pass");
    }

    const gw = extractGatewayFields(meta.gatewayData);

    let paidNow = false;
    let mismatch: AmountMismatch | null = null;
    await this.prisma.$transaction(async (tx) => {
      // claim atómico →PAID (idéntico a settleTicket): el perdedor de la
      // carrera ve count=0 y no emite eventos ni upsert del pase.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "PAID" } },
        data: { status: "PAID", ...(gw ?? {}) },
      });
      if (claimed.count === 0) return;
      paidNow = true;

      mismatch = await this.emitSettleEvents(tx, payment, meta, gw, {
        seriesId: order.seriesId,
        month: order.month,
      });

      // el SeriesPass SOLO se emite cuando el pago queda PAID
      await tx.seriesPass.upsert({
        where: {
          seriesId_personId_month: {
            seriesId: order.seriesId,
            personId: payment.personId,
            month: order.month,
          },
        },
        update: { price: payment.amount },
        create: {
          seriesId: order.seriesId,
          personId: payment.personId,
          month: order.month,
          price: payment.amount,
        },
      });
    });

    if (paidNow) {
      const series = await this.prisma.classSeries.findUnique({
        where: { id: order.seriesId },
        select: { name: true },
      });
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.series_pass",
        title: "Pago confirmado — tu pase de serie está activo",
        body: series ? `Para ${series.name} · ${order.month}` : undefined,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          seriesId: order.seriesId,
          seriesName: series?.name ?? null,
          month: order.month,
        },
      });
      if (mismatch) {
        await this.notifyAdminsAmountMismatch(payment, mismatch);
      }
    }

    return { ok: true, status: "PAID" };
  }

  /**
   * Liquidación del plan de academia al PAID: marca el Payment y
   * materializa/renueva el Enrollment de (academia, persona). Si el
   * enrollment vigente aún tiene fecha futura, la compra extiende desde
   * el día siguiente a su vencimiento (membershipBase); si no, parte hoy
   * y reinicia startedAt. Idempotente igual que el pase de serie.
   *
   * Público: el reconcile de suscripciones (T6/T7) lo invoca directo con
   * `meta = { actor: "cron", kind: "renewal", gatewayData }` — un cobro
   * de suscripción se liquida igual que una compra manual, pero su
   * evento de cierre es RENEWAL_SETTLED.
   */
  async settleMembership(
    payment: Payment,
    meta: SettleMeta = { actor: "system" },
  ): Promise<SettleResult> {
    const order = decodeMembershipRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden membership");
    }
    const plan = await this.prisma.membershipPlan.findUnique({
      where: { id: order.planId },
      select: {
        id: true,
        name: true,
        type: true,
        periodDays: true,
        academyId: true,
        academy: { select: { name: true } },
      },
    });
    if (!plan) {
      throw new BadRequestException("plan de la orden membership no existe");
    }

    const gw = extractGatewayFields(meta.gatewayData);
    const now = new Date();
    let paidNow = false;
    let mismatch: AmountMismatch | null = null;
    await this.prisma.$transaction(async (tx) => {
      // claim atómico →PAID (idéntico a settleTicket/settleSeriesPass):
      // el webhook/reconcile que pierde la carrera ve count=0 y no
      // duplica eventos ni extensión de vigencia.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "PAID" } },
        data: { status: "PAID", ...(gw ?? {}) },
      });
      if (claimed.count === 0) return;
      paidNow = true;

      mismatch = await this.emitSettleEvents(tx, payment, meta, gw, {
        planId: plan.id,
        academyId: plan.academyId,
      });

      // Enrollment no tiene @@unique(academyId,personId) — el histórico
      // se permite por diseño (el alta staff ya hace check manual de
      // duplicados). findFirst + update/create dentro de la tx.
      const existing = await tx.enrollment.findFirst({
        where: {
          academyId: plan.academyId,
          personId: payment.personId,
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, startedAt: true, endsAt: true },
      });
      // Solo extiende si la inscripción sigue vigente (ACTIVE con fecha
      // futura); una vencida/pausada reinicia el ciclo desde hoy.
      const stillActive =
        existing?.status === "ACTIVE" &&
        existing.endsAt != null &&
        existing.endsAt > now;
      const base = membershipBase(
        now,
        stillActive ? existing.endsAt : null,
      );
      const endsAt = membershipEndsAt(plan, base);

      if (existing) {
        await tx.enrollment.update({
          where: { id: existing.id },
          data: {
            planId: plan.id,
            status: "ACTIVE",
            pausedAt: null,
            endsAt,
            // Renovación conserva el alta original; vuelta desde
            // pausa/vencimiento reinicia el ciclo.
            startedAt: stillActive ? existing.startedAt : now,
          },
        });
      } else {
        await tx.enrollment.create({
          data: {
            academyId: plan.academyId,
            personId: payment.personId,
            planId: plan.id,
            status: "ACTIVE",
            startedAt: now,
            endsAt,
          },
        });
      }
    });

    if (paidNow) {
      const clp = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(payment.amount);
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.membership",
        title: "Pago confirmado — tu plan está activo",
        body: `${plan.name} · ${plan.academy.name} · ${clp}`,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          planId: plan.id,
          planName: plan.name,
          academyId: plan.academyId,
          academyName: plan.academy.name,
          amount: payment.amount,
        },
      });
      if (mismatch) {
        await this.notifyAdminsAmountMismatch(payment, mismatch);
      }
    }

    return { ok: true, status: "PAID" };
  }

  /**
   * Liquidación de clase suelta / taller (spec academy-workshops) al
   * PAID: marca el Payment y materializa el ClassBooking con paymentId —
   * ocupa cupo físico, nunca consume cuota del plan ni exige
   * inscripción. Si el cupo se llenó entre el checkout y el pago la
   * reserva entra como WAITLIST (pagó → queda en cola; la academia
   * gestiona el aforo o la devolución manual). Si ya existía una reserva
   * CANCELLED la reactiva como pagada. Idempotente igual que las otras
   * ramas: el claim atómico →PAID deduplica el efecto.
   */
  private async settleClassDropin(
    payment: Payment,
    meta: SettleMeta,
  ): Promise<SettleResult> {
    const order = decodeClassRef(payment.refId);
    if (!order) {
      throw new BadRequestException("pago sin contexto de orden workshop");
    }
    const cls = await this.prisma.class.findUnique({
      where: { id: order.classId },
      select: {
        id: true,
        capacity: true,
        slot: {
          select: {
            academyId: true,
            capacity: true,
            series: { select: { name: true, quorum: true } },
            academy: { select: { defaultQuorum: true } },
          },
        },
      },
    });
    if (!cls) {
      throw new BadRequestException("clase de la orden workshop no existe");
    }
    const capacity = effectiveCapacity({
      classCapacity: cls.capacity,
      slotCapacity: cls.slot.capacity,
      seriesQuorum: cls.slot.series.quorum,
      academyDefaultQuorum: cls.slot.academy.defaultQuorum,
    });

    const gw = extractGatewayFields(meta.gatewayData);
    let paidNow = false;
    let mismatch: AmountMismatch | null = null;
    let bookingStatus: "BOOKED" | "WAITLIST" = "BOOKED";
    await this.prisma.$transaction(async (tx) => {
      // claim atómico →PAID (idéntico a las otras ramas): el perdedor de
      // la carrera ve count=0 y no duplica eventos ni reserva.
      const claimed = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: "PAID" } },
        data: { status: "PAID", ...(gw ?? {}) },
      });
      if (claimed.count === 0) return;
      paidNow = true;

      mismatch = await this.emitSettleEvents(tx, payment, meta, gw, {
        classId: cls.id,
        academyId: cls.slot.academyId,
      });

      const booked = await tx.classBooking.count({
        where: { classId: cls.id, status: "BOOKED" },
      });
      bookingStatus = booked < capacity ? "BOOKED" : "WAITLIST";

      // @@unique(classId,personId): si ya hay fila (p.ej. reserva de plan
      // cancelada, o asiento de una compra anterior) la reactiva como
      // pagada — el pago nuevo manda sobre el enrollmentId.
      const existing = await tx.classBooking.findUnique({
        where: {
          classId_personId: { classId: cls.id, personId: payment.personId },
        },
        select: { id: true, status: true },
      });
      if (existing) {
        await tx.classBooking.update({
          where: { id: existing.id },
          data: {
            status: bookingStatus,
            cancelledAt: null,
            paymentId: payment.id,
            enrollmentId: null,
          },
        });
      } else {
        await tx.classBooking.create({
          data: {
            classId: cls.id,
            personId: payment.personId,
            status: bookingStatus,
            paymentId: payment.id,
            enrollmentId: null,
          },
        });
      }
    });

    if (paidNow) {
      const clp = new Intl.NumberFormat("es-CL", {
        style: "currency",
        currency: "CLP",
        maximumFractionDigits: 0,
      }).format(payment.amount);
      await this.notifications.notifySafe(payment.personId, {
        category: "TRANSACTIONAL",
        type: "payment.paid",
        title:
          bookingStatus === "BOOKED"
            ? "Pago confirmado — tu cupo está reservado"
            : "Pago confirmado — quedaste en lista de espera",
        body: cls.slot.series.name
          ? `${cls.slot.series.name} · ${clp}`
          : clp,
        data: {
          paymentId: payment.id,
          refId: payment.refId,
          classId: cls.id,
          seriesName: cls.slot.series.name,
          academyId: cls.slot.academyId,
          bookingStatus,
          amount: payment.amount,
        },
      });
      if (mismatch) {
        await this.notifyAdminsAmountMismatch(payment, mismatch);
      }
    }

    return { ok: true, status: "PAID" };
  }
}
