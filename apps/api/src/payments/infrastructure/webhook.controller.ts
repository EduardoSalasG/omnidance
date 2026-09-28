import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request, Response } from "express";
import type { Payment } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { PAYMENT_GATEWAY, type PaymentGateway } from "../domain/ports";
import { PaymentSettlementService } from "../application/payment-settlement.service";
import { SubscriptionsService } from "../application/subscriptions.service";
import {
  decodeClassRef,
  decodePrivateRef,
  decodeMembershipRef,
  decodeSeriesPassRef,
  decodeTicketOrderRef,
} from "../domain/order-ref";

const AUDIT_TAKE = 100;

class WebhookDto {
  @IsOptional()
  @IsString()
  refId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  signature?: string;

  // Flow notifica solo { token }
  @IsOptional()
  @IsString()
  token?: string;
}

class FlowTokenDto {
  @IsOptional()
  @IsString()
  token?: string;
}

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly settlement: PaymentSettlementService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // Público: lo llama la pasarela (o el stub en dev).
  // Idempotente: re-notificación PAID no duplica ticket ni usedCount —
  // la transición real vive en PaymentSettlementService.settle; aquí solo
  // queda verificación + lookup + evidencia WEBHOOK_RECEIVED.
  @Post("webhook")
  @HttpCode(200)
  async webhook(@Body() body: WebhookDto) {
    let result: {
      refId: string;
      status: "PAID" | "FAILED";
      gatewayData?: unknown;
    };
    try {
      result = await this.gateway.verifyWebhook(body);
    } catch {
      throw new BadRequestException("webhook inválido");
    }

    const payment = await this.prisma.payment.findFirst({
      where: { refId: result.refId },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");

    // WEBHOOK_RECEIVED se emite SIEMPRE — un webhook duplicado también es
    // evidencia. Los eventos de transición (STATUS_CONFIRMED, SETTLED,
    // FAILED…) solo se emiten dentro del settle cuando hay cambio real.
    await this.settlement.recordWebhookReceived(payment, {
      remoteStatus: result.status,
      body,
    });

    return this.settlement.settle(payment, result.status, {
      actor: "webhook",
      gatewayData: result.gatewayData,
    });
  }

  /**
   * Retorno del browser tras el disclaimer de registro de tarjeta de
   * Flow (url_return de customer/register — Flow POSTea {token}).
   * Público: el service registra el INBOUND, resuelve el customer y
   * crea la suscripción pendiente; acá solo se traduce a redirect 303
   * hacia la ficha de la academia (`?sub=ok|error`). Nunca responde
   * error HTTP al browser — el redirect es la respuesta.
   */
  @Post("flow/customer-return")
  async customerReturn(@Body() body: FlowTokenDto, @Res() res: Response) {
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const errorTo = (academyId?: string | null) =>
      academyId
        ? `${webUrl}/academias/${academyId}?sub=error`
        : `${webUrl}/academias?sub=error`;
    if (!body.token) return res.redirect(303, errorTo());
    try {
      const r = await this.subscriptions.customerReturn(body.token);
      return res.redirect(
        303,
        r.ok
          ? `${webUrl}/academias/${r.academyId}?sub=ok`
          : errorTo(r.academyId),
      );
    } catch {
      return res.redirect(303, errorTo());
    }
  }

  /**
   * urlCallback de los Flow-plans de suscripción (registrado en
   * plans/create). Público: registra el INBOUND en GatewayTransaction y
   * dispara reconcileAll fire-and-forget — responde 200 siempre (Flow
   * reintenta ante no-200 y repetiría el barrido completo).
   */
  @Post("subscription-webhook")
  @HttpCode(200)
  async subscriptionWebhook(@Body() body: FlowTokenDto) {
    await this.subscriptions.subscriptionWebhook(body.token ?? null);
    return { ok: true };
  }

  // ─── Vistas de auditoría por actor ──────────────────────────────────
  // Row común: montos de la orden + verdad monetaria reportada por la
  // pasarela (gatewayFeeClp/gatewayReportedAmount/gatewayMedia/
  // gatewayPaidAt) + eventCount del ledger. `gatewayRaw` nunca sale por
  // estos endpoints — es evidencia interna (solo admin/browse).
  // Las rutas estáticas van ANTES de ":id" (Express matchea en orden de
  // registro — si no, /payments/mine caería en getPayment con id="mine").

  /**
   * GET /payments/mine — historial del autenticado (≤100, recientes
   * primero) con contador de eventos del ledger y contexto de compra
   * resuelto (eventName / seriesName / academyName + planName).
   */
  @Get("mine")
  @UseGuards(SessionGuard)
  async myPayments(@Req() req: Request) {
    const payments = await this.prisma.payment.findMany({
      where: { personId: req.person!.id },
      orderBy: { createdAt: "desc" },
      take: AUDIT_TAKE,
      include: { _count: { select: { events: true } } },
    });
    return this.withContextNames(payments);
  }

  /**
   * GET /payments/by-event/:eventId — ventas del evento para su
   * productor (event.producerId === caller) o admin.access.
   * Solo órdenes con eventId directo: un SERIES_PASS pertenece a la
   * serie (mes completo), no a una fecha puntual — su devengo ya se
   * liquida por serie en payouts, mezclarlo aquí inflaría la recaudación
   * del evento.
   */
  @Get("by-event/:eventId")
  @UseGuards(SessionGuard)
  async paymentsByEvent(
    @Req() req: Request,
    @Param("eventId") eventId: string,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, producerId: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    const person = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    if (event.producerId !== person.id && !isAdmin) {
      throw new ForbiddenException(
        "requiere ser el productor del evento o admin",
      );
    }
    const payments = await this.prisma.payment.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "desc" },
      take: AUDIT_TAKE,
      include: { _count: { select: { events: true } } },
    });
    return this.withContextNames(payments);
  }

  /**
   * GET /payments/by-academy/:academyId — cobros MEMBERSHIP de los planes
   * + WORKSHOP (clases sueltas/talleres pagos) + PRIVATE (clase
   * particular comprable) de la academia. La orden no tiene columna de
   * academia: el refId (mem_<planId>_<uid> / wks_<classId>_<uid> /
   * pvt_<academyId>_<uid>) decodifica al plan, la clase o la academia
   * misma — el filtro `refId startsWith` es el mismo decode+belongs
   * de payouts, resuelto en SQL. Owner de la academia o admin.access
   * (no existe permiso academies.manage — la administración financiera
   * de la academia es owner|admin, como canAdministerAcademy).
   */
  @Get("by-academy/:academyId")
  @UseGuards(SessionGuard)
  async paymentsByAcademy(
    @Req() req: Request,
    @Param("academyId") academyId: string,
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, ownerId: true },
    });
    if (!academy) throw new NotFoundException("academia no encontrada");
    const person = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    if (academy.ownerId !== person.id && !isAdmin) {
      throw new ForbiddenException(
        "requiere ser el owner de la academia o admin",
      );
    }
    const [plans, classes] = await Promise.all([
      this.prisma.membershipPlan.findMany({
        where: { academyId: academy.id },
        select: { id: true },
      }),
      this.prisma.class.findMany({
        where: { slot: { academyId: academy.id } },
        select: { id: true },
      }),
    ]);
    const or = [
      ...plans.map((p) => ({ refId: { startsWith: `mem_${p.id}_` } })),
      ...classes.map((c) => ({ refId: { startsWith: `wks_${c.id}_` } })),
      // PRIVATE: el refId codifica la academia misma (pvt_<academyId>_).
      { refId: { startsWith: `pvt_${academy.id}_` } },
    ];
    const payments = await this.prisma.payment.findMany({
      where: {
        orderType: { in: ["MEMBERSHIP", "WORKSHOP", "PRIVATE"] },
        OR: or,
      },
      orderBy: { createdAt: "desc" },
      take: AUDIT_TAKE,
      include: { _count: { select: { events: true } } },
    });
    return this.withContextNames(payments);
  }

  /**
   * GET /payments/:id/events — ledger append-only del pago ordenado por
   * seq: cada evento con su payload y payloadHash (la evidencia
   * tamper-evident completa). Dueño del pago o admin.access; el staff
   * del actor relacionado audita vía by-event/by-academy. 404 para
   * ajenos — misma política anti-enumeración que GET /payments/:id.
   */
  @Get(":id/events")
  @UseGuards(SessionGuard)
  async paymentEvents(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      select: { id: true, personId: true },
    });
    if (!payment) throw new NotFoundException("pago no encontrado");
    const person = req.person!;
    const isAdmin = await roleKeysHavePermission(this.prisma, person.roles, [
      "admin.access",
    ]);
    if (payment.personId !== person.id && !isAdmin) {
      throw new NotFoundException("pago no encontrado");
    }
    return this.prisma.paymentEvent.findMany({
      where: { paymentId: payment.id },
      orderBy: { seq: "asc" },
    });
  }

  // Polling desde el checkout (solo el dueño del pago). Si la pasarela
  // soporta consulta activa (Flow.refreshStatus por commerceOrder) y la
  // orden sigue PENDING, se le pregunta directamente — cubre sandbox/dev
  // donde el webhook no puede alcanzar localhost; un estado terminal
  // pasa por el mismo settle del webhook (idempotente).
  @Get(":id")
  @UseGuards(SessionGuard)
  async getPayment(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.personId !== req.person!.id) {
      throw new NotFoundException("pago no encontrado");
    }

    if (payment.status === "PENDING" && this.gateway.refreshStatus) {
      try {
        const remote = await this.gateway.refreshStatus(payment.refId);
        if (remote.status !== "PENDING") {
          await this.settlement.settle(payment, remote.status, {
            actor: "polling",
            gatewayData: remote.gatewayData,
          });
          const fresh = await this.prisma.payment.findUnique({
            where: { id: payment.id },
            select: { status: true },
          });
          if (fresh) payment.status = fresh.status;
        }
      } catch {
        // best-effort: si la pasarela no responde se devuelve el estado
        // local (PENDING) y el próximo poll reintenta.
      }
    }

    return {
      id: payment.id,
      orderType: payment.orderType,
      status: payment.status,
      amount: payment.amount,
      createdAt: payment.createdAt,
    };
  }

  /**
   * Tickets emitidos por esta orden (solo el dueño del pago) — el éxito
   * del checkout los necesita para pintar los links de reclamo. Devuelve
   * id + claimToken; nada más del ticket es necesario ahí.
   */
  @Get(":id/tickets")
  @UseGuards(SessionGuard)
  async paymentTickets(@Req() req: Request, @Param("id") id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment || payment.personId !== req.person!.id) {
      throw new NotFoundException("pago no encontrado");
    }
    if (payment.orderType !== "TICKET" || payment.status !== "PAID") {
      return [];
    }
    // Ticket.paymentId vincula exacto con la orden que los emitió.
    const tickets = await this.prisma.ticket.findMany({
      where: { paymentId: payment.id },
      select: { id: true, claimToken: true, ownerId: true },
      orderBy: { createdAt: "asc" },
    });
    return tickets;
  }

  /**
   * Proyecta filas Payment → row de auditoría y resuelve el contexto de
   * compra con lookups batch (el schema no declara esas relaciones):
   * TICKET → eventName (eventId directo; fallback decode tkt_ legacy),
   * SERIES_PASS → seriesName (refId sp_<seriesId>_), MEMBERSHIP →
   * academyName + planName (refId mem_<planId>_ → plan.academyId).
   */
  private async withContextNames(
    payments: Array<Payment & { _count: { events: number } }>,
  ) {
    const eventIds = new Set<string>();
    const seriesIds = new Set<string>();
    const planIds = new Set<string>();
    const classIds = new Set<string>();
    const academyIdsFromPayments = new Set<string>();
    for (const p of payments) {
      const eventId =
        p.eventId ??
        (p.orderType === "TICKET"
          ? decodeTicketOrderRef(p.refId)?.eventId
          : null);
      if (eventId) eventIds.add(eventId);
      if (p.orderType === "SERIES_PASS") {
        const seriesId = decodeSeriesPassRef(p.refId)?.seriesId;
        if (seriesId) seriesIds.add(seriesId);
      }
      if (p.orderType === "MEMBERSHIP") {
        const planId = decodeMembershipRef(p.refId)?.planId;
        if (planId) planIds.add(planId);
      }
      if (p.orderType === "WORKSHOP") {
        const classId = decodeClassRef(p.refId)?.classId;
        if (classId) classIds.add(classId);
      }
      // PRIVATE: el refId codifica la academia directamente (pvt_).
      if (p.orderType === "PRIVATE") {
        const academyId = decodePrivateRef(p.refId)?.academyId;
        if (academyId) academyIdsFromPayments.add(academyId);
      }
    }
    const [events, series, plans, classes] = await Promise.all([
      eventIds.size
        ? this.prisma.event.findMany({
            where: { id: { in: [...eventIds] } },
            select: { id: true, name: true },
          })
        : [],
      seriesIds.size
        ? this.prisma.eventSeries.findMany({
            where: { id: { in: [...seriesIds] } },
            select: { id: true, name: true },
          })
        : [],
      planIds.size
        ? this.prisma.membershipPlan.findMany({
            where: { id: { in: [...planIds] } },
            select: { id: true, name: true, academyId: true },
          })
        : [],
      // WORKSHOP: la academia y la serie se derivan de la clase
      // (slot → academyId / series.name).
      classIds.size
        ? this.prisma.class.findMany({
            where: { id: { in: [...classIds] } },
            select: {
              id: true,
              slot: {
                select: {
                  academyId: true,
                  series: { select: { name: true } },
                },
              },
            },
          })
        : [],
    ]);
    const eventNameOf = new Map(events.map((e) => [e.id, e.name]));
    const seriesNameOf = new Map(series.map((s) => [s.id, s.name]));
    const planOf = new Map(plans.map((p) => [p.id, p]));
    const classOf = new Map(classes.map((c) => [c.id, c]));

    const academyIds = [
      ...new Set([
        ...plans.map((p) => p.academyId),
        ...classes.map((c) => c.slot.academyId),
        ...academyIdsFromPayments,
      ]),
    ];
    const academies = academyIds.length
      ? await this.prisma.academy.findMany({
          where: { id: { in: academyIds } },
          select: { id: true, name: true },
        })
      : [];
    const academyNameOf = new Map(academies.map((a) => [a.id, a.name]));

    return payments.map((p) => {
      const seriesId =
        p.orderType === "SERIES_PASS"
          ? decodeSeriesPassRef(p.refId)?.seriesId
          : undefined;
      const plan =
        p.orderType === "MEMBERSHIP"
          ? planOf.get(decodeMembershipRef(p.refId)?.planId ?? "")
          : undefined;
      const wksClass =
        p.orderType === "WORKSHOP"
          ? classOf.get(decodeClassRef(p.refId)?.classId ?? "")
          : undefined;
      const pvtAcademyId =
        p.orderType === "PRIVATE"
          ? decodePrivateRef(p.refId)?.academyId
          : undefined;
      const eventId =
        p.eventId ??
        (p.orderType === "TICKET"
          ? decodeTicketOrderRef(p.refId)?.eventId
          : null);
      return {
        id: p.id,
        orderType: p.orderType,
        refId: p.refId,
        amount: p.amount,
        fee: p.fee,
        net: p.net,
        status: p.status,
        createdAt: p.createdAt,
        gatewayFeeClp: p.gatewayFeeClp,
        gatewayReportedAmount: p.gatewayReportedAmount,
        gatewayMedia: p.gatewayMedia,
        gatewayPaidAt: p.gatewayPaidAt,
        eventCount: p._count.events,
        // Ids de contexto: la UI linkea el pago a su evento/academia
        // (p.ej. /perfil/pagos → ficha donde vive la gestión del plan).
        eventId: eventId ?? null,
        academyId:
          plan?.academyId ?? wksClass?.slot.academyId ?? pvtAcademyId ?? null,
        classId: wksClass?.id ?? null,
        eventName: eventId ? (eventNameOf.get(eventId) ?? null) : null,
        seriesName: seriesId
          ? (seriesNameOf.get(seriesId) ?? null)
          : (wksClass?.slot.series.name ?? null),
        academyName:
          plan || wksClass || pvtAcademyId
            ? (academyNameOf.get(
                plan?.academyId ?? wksClass?.slot.academyId ?? pvtAcademyId ?? "",
              ) ?? null)
            : null,
        planName: plan?.name ?? null,
      };
    });
  }
}
