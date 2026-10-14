import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { AcademyAccess } from "../../academies/infrastructure/academy-access.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";

// Preventa por academias (spec academy-presale-commission): el productor
// invita academias a vender su preventa por un % del precio de lista. La
// plataforma no mueve la comisión - la acumula como pasivo computado
// (suma de Payment.academyCommissionClp PAID) y el productor la regulariza
// por fuera marcándola pagada (AcademySaleSettlement = marca de pago).

export type AgreementStatus = "INVITED" | "ACTIVE" | "DECLINED" | "DISABLED";

const COMMISSION_MIN = 1;
const COMMISSION_MAX = 90;

export interface AgreementView {
  id: string;
  eventId: string | null;
  seriesId: string | null;
  academyId: string;
  academyName: string;
  commissionPct: number;
  maxTickets: number | null;
  status: AgreementStatus;
  respondedAt: Date | null;
  createdAt: Date;
  /** Link compartible: el front lo arma con el origen web + ?a=. */
  stats: {
    /** Tickets PAID atribuidos por ambos canales (link ?a= + códigos). */
    soldTickets: number;
    /** Códigos 100% emitidos por la academia (spec academy-presale-codes). */
    codesEmitted: number;
    /** Comisión devengada del canal link - pasivo productor→academia. */
    commissionAccruedClp: number;
    /**
     * Cuenta por cobrar del canal código: la academia cobró el efectivo
     * y debe al productor (precioLista − comisión) por cada código
     * redimido PAID.
     */
    codeReceivableClp: number;
    /** Neto ya saldado (signed: + productor→academia, − academia→producer). */
    settledClp: number;
    /**
     * Saldo pendiente signed: > 0 el productor debe a la academia;
     * < 0 la academia debe al productor.
     */
    pendingClp: number;
  };
}

export class AcademyNotApprovedError extends Error {
  constructor() {
    super("la academia no está aprobada en la plataforma");
    this.name = "AcademyNotApprovedError";
  }
}

export class DuplicateAgreementError extends Error {
  constructor() {
    super("ya existe un acuerdo con esa academia para este alcance");
    this.name = "DuplicateAgreementError";
  }
}

@Injectable()
export class AcademySalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
    private readonly notifications: NotificationsService,
  ) {}

  /** owner del evento/serie o admin.access - mismo patrón de events.controller. */
  private async requireOwnerOrAdmin(
    producerId: string | null,
    person: { id: string; roles: string[] },
  ): Promise<void> {
    if (producerId === person.id) return;
    if (
      await roleKeysHavePermission(this.prisma, person.roles, ["admin.access"])
    ) {
      return;
    }
    throw new ForbiddenException("solo el productor del evento o un admin");
  }

  /** Academia invitable: existe, activa y su owner tiene ACADEMY_OWNER APPROVED. */
  private async assertApprovedAcademy(academyId: string) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, name: true, active: true, ownerId: true },
    });
    if (!academy?.active) throw new AcademyNotApprovedError();
    const ownerRole = await this.prisma.personRole.findFirst({
      where: {
        personId: academy.ownerId,
        role: "ACADEMY_OWNER",
        status: "APPROVED",
      },
      select: { id: true },
    });
    if (!ownerRole) throw new AcademyNotApprovedError();
    return academy;
  }

  /**
   * Acuerdo vigente para una compra: ACTIVE sobre el evento o su serie.
   * Devuelve null sin acuerdo - el checkout ignora la atribución.
   */
  async activeAgreementFor(
    eventId: string,
    seriesId: string | null,
    academyId: string,
  ) {
    return this.prisma.academySaleAgreement.findFirst({
      where: {
        academyId,
        status: "ACTIVE",
        OR: [
          { eventId },
          ...(seriesId ? [{ seriesId }] : []),
        ],
      },
    });
  }

  /**
   * Alcance del acuerdo sobre Payment: el acuerdo de serie cubre todos
   * los eventos de la serie. Payment no tiene relación `event` (solo
   * eventId escalar desnormalizado) - el lookup de la serie resuelve los
   * ids de evento y el filtro queda por eventId IN (...).
   */
  private async paymentScope(agreement: {
    eventId: string | null;
    seriesId: string | null;
  }): Promise<{ eventId: string | { in: string[] } }> {
    if (agreement.eventId) return { eventId: agreement.eventId };
    const events = await this.prisma.event.findMany({
      where: { seriesId: agreement.seriesId! },
      select: { id: true },
    });
    return { eventId: { in: events.map((e) => e.id) } };
  }

  /**
   * Cupo del acuerdo: tickets ya vendidos bajo atribución (órdenes PAID).
   * Con maxTickets definido, al llegar al cupo la atribución se apaga.
   */
  private async attributedTickets(agreement: {
    id: string;
    eventId: string | null;
    seriesId: string | null;
    academyId: string;
  }): Promise<number> {
    const scope = await this.paymentScope(agreement);
    const agg = await this.prisma.payment.aggregate({
      _sum: { quantity: true },
      where: {
        orderType: "TICKET",
        status: "PAID",
        soldByAcademyId: agreement.academyId,
        ...scope,
      },
    });
    return agg._sum.quantity ?? 0;
  }

  /** Ids de los códigos 100% emitidos bajo el acuerdo (canal código). */
  private async agreementCodeIds(agreementId: string): Promise<string[]> {
    const codes = await this.prisma.discountCode.findMany({
      where: { academySaleAgreementId: agreementId },
      select: { id: true },
    });
    return codes.map((c) => c.id);
  }

  /**
   * Tickets PAID del canal LINK (soldByAcademyId sin código del acuerdo).
   * Una orden por link puede además usar un código normal (CAMPAIGN etc.)
   * - solo se excluyen los códigos emitidos por ESTE acuerdo.
   */
  private async linkTickets(
    agreement: {
      id: string;
      eventId: string | null;
      seriesId: string | null;
      academyId: string;
    },
    codeIds: string[],
  ): Promise<number> {
    const scope = await this.paymentScope(agreement);
    const agg = await this.prisma.payment.aggregate({
      _sum: { quantity: true },
      where: {
        orderType: "TICKET",
        status: "PAID",
        soldByAcademyId: agreement.academyId,
        ...scope,
        OR: [
          { discountCodeId: null },
          ...(codeIds.length
            ? [{ discountCodeId: { notIn: codeIds } }]
            : []),
        ],
      },
    });
    return agg._sum.quantity ?? 0;
  }

  /**
   * Cuenta por cobrar del canal código (academy-presale-codes): cada
   * código redimido PAID vale (precioLista × quantity − comisión
   * congelada) - la academia cobró ese efectivo y se lo debe al
   * productor, quedándose con su comisión.
   */
  private async codeReceivable(codeIds: string[]): Promise<number> {
    if (!codeIds.length) return 0;
    const payments = await this.prisma.payment.findMany({
      where: {
        orderType: "TICKET",
        status: "PAID",
        discountCodeId: { in: codeIds },
      },
      select: {
        unitListPrice: true,
        quantity: true,
        academyCommissionClp: true,
      },
    });
    return payments.reduce(
      (sum, p) =>
        sum +
        (p.unitListPrice ?? 0) * p.quantity -
        (p.academyCommissionClp ?? 0),
      0,
    );
  }

  /**
   * Resolución de atribución para el checkout (spec ticket-purchase):
   * academyId + acuerdo ACTIVE (evento o serie) → {soldByAcademyId,
   * academyCommissionClp}; sin acuerdo o cupo agotado → null (la compra
   * procede sin atribución). La comisión se congela sobre el precio de
   * LISTA por ticket × quantity - los descuentos no la tocan.
   */
  async resolveAttribution(input: {
    eventId: string;
    seriesId: string | null;
    academyId?: string;
    unitListPrice: number;
    quantity: number;
    channel: string;
  }): Promise<{ soldByAcademyId: string; academyCommissionClp: number } | null> {
    if (input.channel !== "PRESALE" || !input.academyId) return null;
    const agreement = await this.activeAgreementFor(
      input.eventId,
      input.seriesId,
      input.academyId,
    );
    if (!agreement) return null;
    if (agreement.maxTickets != null) {
      // El cupo cubre ambos canales: tickets vendidos por link + códigos
      // emitidos (cada código emitido reserva un cupo aunque aún no se
      // redima - ya está en manos de la academia).
      const codeIds = await this.agreementCodeIds(agreement.id);
      const sold = await this.linkTickets(agreement, codeIds);
      if (sold + codeIds.length >= agreement.maxTickets) return null;
    }
    return {
      soldByAcademyId: agreement.academyId,
      academyCommissionClp:
        Math.round((input.unitListPrice * agreement.commissionPct) / 100) *
        input.quantity,
    };
  }

  /**
   * Acuerdo de un código ACADEMY_PRESALE: el vínculo
   * DiscountCode.academySaleAgreementId resuelve la atribución sin
   * necesitar el link ?a=. El checkout valida status/scope por su lado.
   */
  async codeAgreement(code: { academySaleAgreementId: string | null }) {
    if (!code.academySaleAgreementId) return null;
    return this.prisma.academySaleAgreement.findUnique({
      where: { id: code.academySaleAgreementId },
    });
  }

  /**
   * Saldo bidireccional del acuerdo (spec academy-presale-codes):
   * - Canal link (?a=): el productor cobró por app → le debe la comisión
   *   a la academia (linkAccrued).
   * - Canal código: la academia cobró el efectivo → le debe al productor
   *   precioLista − comisión por cada código redimido (codeReceivable).
   * - settled = marcas de pago signed (+ productor pagó, − academia pagó).
   * pending signed: > 0 a favor de la academia, < 0 a favor del productor.
   */
  private async debtFor(agreement: {
    id: string;
    eventId: string | null;
    seriesId: string | null;
    academyId: string;
  }): Promise<{
    linkAccrued: number;
    codeReceivable: number;
    settled: number;
    pending: number;
  }> {
    const scope = await this.paymentScope(agreement);
    const codeIds = await this.agreementCodeIds(agreement.id);
    const [accruedAgg, receivable, settledAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { academyCommissionClp: true },
        where: {
          orderType: "TICKET",
          status: "PAID",
          soldByAcademyId: agreement.academyId,
          ...scope,
          OR: [
            { discountCodeId: null },
            ...(codeIds.length
              ? [{ discountCodeId: { notIn: codeIds } }]
              : []),
          ],
        },
      }),
      this.codeReceivable(codeIds),
      this.prisma.academySaleSettlement.aggregate({
        _sum: { amountDue: true },
        where: { agreementId: agreement.id },
      }),
    ]);
    const linkAccrued = accruedAgg._sum.academyCommissionClp ?? 0;
    const settled = settledAgg._sum.amountDue ?? 0;
    return {
      linkAccrued,
      codeReceivable: receivable,
      settled,
      pending: linkAccrued - receivable - settled,
    };
  }

  private async toView(a: {
    id: string;
    eventId: string | null;
    seriesId: string | null;
    academyId: string;
    academy: { name: string };
    commissionPct: number;
    maxTickets: number | null;
    status: string;
    respondedAt: Date | null;
    createdAt: Date;
  }): Promise<AgreementView> {
    const [debt, soldTickets, codesEmitted] = await Promise.all([
      this.debtFor(a),
      this.attributedTickets(a),
      this.prisma.discountCode.count({
        where: { academySaleAgreementId: a.id },
      }),
    ]);
    return {
      id: a.id,
      eventId: a.eventId,
      seriesId: a.seriesId,
      academyId: a.academyId,
      academyName: a.academy.name,
      commissionPct: a.commissionPct,
      maxTickets: a.maxTickets,
      status: a.status as AgreementStatus,
      respondedAt: a.respondedAt,
      createdAt: a.createdAt,
      stats: {
        soldTickets,
        codesEmitted,
        commissionAccruedClp: debt.linkAccrued,
        codeReceivableClp: debt.codeReceivable,
        settledClp: debt.settled,
        pendingClp: debt.pending,
      },
    };
  }

  /**
   * El productor invita una academia a vender la preventa de su evento o
   * serie (XOR: exactamente uno de eventId/seriesId). Queda INVITED y la
   * academia responde; solo ACTIVE atribuye ventas.
   */
  async createAgreement(
    producer: { id: string; roles: string[] },
    input: {
      eventId?: string;
      seriesId?: string;
      academyId: string;
      commissionPct: number;
      maxTickets?: number;
    },
  ): Promise<AgreementView> {
    if (
      (input.eventId == null) === (input.seriesId == null) ||
      input.commissionPct < COMMISSION_MIN ||
      input.commissionPct > COMMISSION_MAX
    ) {
      throw new BadRequestException(
        "alcance evento XOR serie y comisión entre 1 y 90",
      );
    }
    let producerId: string | null;
    let scopeName = "";
    if (input.eventId) {
      const event = await this.prisma.event.findUnique({
        where: { id: input.eventId },
        select: { id: true, producerId: true, name: true },
      });
      if (!event) throw new NotFoundException("evento no encontrado");
      producerId = event.producerId;
      scopeName = event.name;
    } else {
      const series = await this.prisma.eventSeries.findUnique({
        where: { id: input.seriesId! },
        select: { id: true, producerId: true, name: true },
      });
      if (!series) throw new NotFoundException("serie no encontrada");
      producerId = series.producerId;
      scopeName = series.name;
    }
    await this.requireOwnerOrAdmin(producerId, producer);
    const academy = await this.assertApprovedAcademy(input.academyId);

    const dup = await this.prisma.academySaleAgreement.findFirst({
      where: {
        academyId: input.academyId,
        OR: [
          ...(input.eventId ? [{ eventId: input.eventId }] : []),
          ...(input.seriesId ? [{ seriesId: input.seriesId }] : []),
        ],
      },
    });
    if (dup) throw new DuplicateAgreementError();

    const created = await this.prisma.academySaleAgreement.create({
      data: {
        eventId: input.eventId ?? null,
        seriesId: input.seriesId ?? null,
        academyId: input.academyId,
        commissionPct: input.commissionPct,
        maxTickets: input.maxTickets ?? null,
        createdById: producer.id,
      },
      include: { academy: { select: { name: true } } },
    });
    await this.notifications
      .notify(academy.ownerId, {
        category: "TRANSACTIONAL",
        type: "academy.sale_deal.invited",
        title: `Invitación a vender preventa: ${scopeName}`,
        body: `Te invitaron a vender preventa con ${input.commissionPct}% de comisión.`,
        data: { agreementId: created.id },
      })
      .catch(() => undefined);
    return this.toView(created);
  }

  /** Acuerdos de un evento con stats - vista de la ficha del productor. */
  async listForEvent(eventId: string, person: { id: string; roles: string[] }) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { producerId: true, seriesId: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");
    await this.requireOwnerOrAdmin(event.producerId, person);
    // Incluye los acuerdos de la serie padre - también atribuyen ventas
    // de este evento y el productor los ve en la misma ficha.
    const agreements = await this.prisma.academySaleAgreement.findMany({
      where: {
        OR: [
          { eventId },
          ...(event.seriesId ? [{ seriesId: event.seriesId }] : []),
        ],
      },
      include: { academy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(agreements.map((a) => this.toView(a)));
  }

  /**
   * PATCH sobre el acuerdo: el productor dueño edita commissionPct /
   * maxTickets (afecta solo órdenes futuras - el snapshot vive en cada
   * Payment) o desactiva; la academia acepta/rechaza cuando está INVITED.
   */
  async patchAgreement(
    agreementId: string,
    person: { id: string; roles: string[] },
    input: {
      action?: "accept" | "decline" | "disable";
      commissionPct?: number;
      maxTickets?: number | null;
    },
  ): Promise<AgreementView> {
    const agreement = await this.prisma.academySaleAgreement.findUnique({
      where: { id: agreementId },
      include: {
        academy: { select: { name: true, ownerId: true } },
        event: { select: { producerId: true, name: true } },
        series: { select: { producerId: true, name: true } },
      },
    });
    if (!agreement) throw new NotFoundException("acuerdo no encontrado");
    const scopeProducerId =
      agreement.event?.producerId ?? agreement.series?.producerId ?? null;
    const scopeName =
      agreement.event?.name ?? agreement.series?.name ?? "";

    // Acciones de la academia: solo sobre acuerdos dirigidos a ella y
    // aún INVITED. Acceso por capacidad payments (decisión comercial).
    if (input.action === "accept" || input.action === "decline") {
      await this.access.requireCapabilityWrite(
        agreement.academyId,
        person,
        "payments",
      );
      if (agreement.status !== "INVITED") {
        throw new ConflictException("el acuerdo ya fue respondido");
      }
      const status = input.action === "accept" ? "ACTIVE" : "DECLINED";
      const updated = await this.prisma.academySaleAgreement.update({
        where: { id: agreementId },
        data: { status, respondedAt: new Date() },
        include: { academy: { select: { name: true } } },
      });
      if (scopeProducerId) {
        await this.notifications
          .notify(scopeProducerId, {
            category: "TRANSACTIONAL",
            type: "academy.sale_deal.responded",
            title:
              status === "ACTIVE"
                ? `${agreement.academy.name} aceptó vender tu preventa`
                : `${agreement.academy.name} rechazó la preventa`,
            body: scopeName,
            data: { agreementId, status },
          })
          .catch(() => undefined);
      }
      return this.toView(updated);
    }

    // Acciones del productor: dueño del alcance o admin.
    await this.requireOwnerOrAdmin(scopeProducerId, person);
    if (input.action === "disable") {
      const updated = await this.prisma.academySaleAgreement.update({
        where: { id: agreementId },
        data: { status: "DISABLED", respondedAt: agreement.respondedAt },
        include: { academy: { select: { name: true } } },
      });
      return this.toView(updated);
    }
    if (
      input.commissionPct != null &&
      (input.commissionPct < COMMISSION_MIN ||
        input.commissionPct > COMMISSION_MAX)
    ) {
      throw new BadRequestException("comisión entre 1 y 90");
    }
    if (input.commissionPct == null && input.maxTickets === undefined) {
      throw new BadRequestException("nada que actualizar");
    }
    const updated = await this.prisma.academySaleAgreement.update({
      where: { id: agreementId },
      data: {
        ...(input.commissionPct != null
          ? { commissionPct: input.commissionPct }
          : {}),
        ...(input.maxTickets !== undefined
          ? { maxTickets: input.maxTickets }
          : {}),
      },
      include: { academy: { select: { name: true } } },
    });
    return this.toView(updated);
  }

  /** Vista academia: sus acuerdos con ventas, comisión devengada y deuda. */
  async listForAcademy(academyId: string, person: { id: string; roles: string[] }) {
    await this.access.requireStaff(academyId, person);
    const agreements = await this.prisma.academySaleAgreement.findMany({
      where: { academyId },
      include: {
        academy: { select: { name: true } },
        event: { select: { id: true, name: true, startsAt: true } },
        series: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      agreements.map(async (a) => ({
        ...(await this.toView(a)),
        eventName: a.event?.name ?? null,
        seriesName: a.series?.name ?? null,
        eventStartsAt: a.event?.startsAt ?? null,
      })),
    );
  }

  /**
   * El productor marca el saldo pendiente del acuerdo como saldado
   * (regularización por fuera de la plataforma - transferencia directa).
   * El saldo es signed: > 0 el productor le pagó a la academia (marca
   * positiva); < 0 la academia le pagó al productor (marca negativa).
   * Persiste la marca con el monto computado ahora; movimientos
   * posteriores generan remanente nuevo. Saldo cero → 409.
   */
  async markPaid(
    agreementId: string,
    person: { id: string; roles: string[] },
    evidenceUrl?: string,
  ) {
    const agreement = await this.prisma.academySaleAgreement.findUnique({
      where: { id: agreementId },
      include: {
        event: { select: { producerId: true } },
        series: { select: { producerId: true } },
      },
    });
    if (!agreement) throw new NotFoundException("acuerdo no encontrado");
    const producerId =
      agreement.event?.producerId ?? agreement.series?.producerId ?? null;
    await this.requireOwnerOrAdmin(producerId, person);
    const debt = await this.debtFor(agreement);
    if (debt.pending === 0) {
      throw new ConflictException("no hay saldo pendiente con esta academia");
    }
    return this.prisma.academySaleSettlement.create({
      data: {
        agreementId,
        eventId: agreement.eventId,
        producerId: producerId!,
        amountDue: debt.pending,
        evidenceUrl: evidenceUrl ?? null,
        paidAt: new Date(),
      },
    });
  }

  // ── Canal código (spec academy-presale-codes) ─────────────────────
  // La academia cobra la preventa en efectivo por fuera y emite un
  // código 100% off por venta; el comprador lo redime en el checkout y
  // la orden $0 se liquida al instante. El vínculo
  // DiscountCode.academySaleAgreementId da la atribución y la cuenta
  // por cobrar academia→productor.

  /** Alfabeto sin ambiguos (0/O, 1/I/L) - el código se dicta a mano. */
  private static readonly CODE_ALPHABET =
    "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  private static readonly CODE_MONTHS = [
    "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
    "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
  ];

  private static codeSlug(name: string): string {
    const s = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // (rango \u0300-\u036f: marcas diacríticas combinantes)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    return s || "ACADEMIA";
  }

  private static codeSuffix(): string {
    let out = "";
    for (let i = 0; i < 4; i += 1) {
      out += AcademySalesService.CODE_ALPHABET[
        Math.floor(Math.random() * AcademySalesService.CODE_ALPHABET.length)
      ];
    }
    return out;
  }

  /**
   * La academia emite un código 100% off de un solo uso por cada venta
   * que cobró en efectivo (staff con capacidad `payments`). Scope del
   * acuerdo (evento o serie); el cupo del acuerdo cubre códigos
   * emitidos + tickets vendidos por link. Reintenta el sufijo ante
   * colisión del código único.
   */
  async createPresaleCode(
    agreementId: string,
    person: { id: string; roles: string[] },
  ) {
    const agreement = await this.prisma.academySaleAgreement.findUnique({
      where: { id: agreementId },
      include: {
        academy: { select: { name: true } },
        event: { select: { startsAt: true } },
      },
    });
    if (!agreement) throw new NotFoundException("acuerdo no encontrado");
    await this.access.requireCapabilityWrite(
      agreement.academyId,
      person,
      "payments",
    );
    if (agreement.status !== "ACTIVE") {
      throw new ConflictException("el acuerdo no está activo");
    }
    if (agreement.maxTickets != null) {
      const codeIds = await this.agreementCodeIds(agreement.id);
      const linkSold = await this.linkTickets(agreement, codeIds);
      if (codeIds.length + linkSold >= agreement.maxTickets) {
        throw new ConflictException(
          "cupo de preventa agotado para esta academia",
        );
      }
    }

    const slug = AcademySalesService.codeSlug(agreement.academy.name);
    const refDate = agreement.event?.startsAt ?? new Date();
    const dd = String(refDate.getDate()).padStart(2, "0");
    const mmm = AcademySalesService.CODE_MONTHS[refDate.getMonth()];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = `${slug}-${dd}${mmm}-${AcademySalesService.codeSuffix()}`;
      try {
        return await this.prisma.discountCode.create({
          data: {
            code,
            type: "ACADEMY_PRESALE",
            percentOff: 100,
            maxUses: 1,
            eventId: agreement.eventId,
            seriesId: agreement.seriesId,
            academySaleAgreementId: agreement.id,
            createdById: person.id,
          },
        });
      } catch (e) {
        // Colisión de código único → reintenta con otro sufijo.
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002" &&
          attempt < 5
        ) {
          continue;
        }
        throw e;
      }
    }
    throw new ConflictException("no se pudo emitir el código - reintenta");
  }

  /**
   * Códigos emitidos del acuerdo con su redención (comprador + pago).
   * Visible para staff de la academia y para el productor dueño del
   * alcance (o admin) - ambos auditan el canal.
   */
  async listPresaleCodes(
    agreementId: string,
    person: { id: string; roles: string[] },
  ) {
    const agreement = await this.prisma.academySaleAgreement.findUnique({
      where: { id: agreementId },
      include: {
        event: { select: { producerId: true } },
        series: { select: { producerId: true } },
      },
    });
    if (!agreement) throw new NotFoundException("acuerdo no encontrado");
    const producerId =
      agreement.event?.producerId ?? agreement.series?.producerId ?? null;
    try {
      await this.access.requireStaff(agreement.academyId, person);
    } catch {
      await this.requireOwnerOrAdmin(producerId, person);
    }

    const codes = await this.prisma.discountCode.findMany({
      where: { academySaleAgreementId: agreementId },
      include: { redemptions: true },
      orderBy: { createdAt: "desc" },
    });
    const personIds = [
      ...new Set(codes.flatMap((c) => c.redemptions.map((r) => r.personId))),
    ];
    const paymentIds = [
      ...new Set(
        codes.flatMap((c) =>
          c.redemptions
            .map((r) => r.paymentId)
            .filter((id): id is string => id != null),
        ),
      ),
    ];
    const [buyers, payments] = await Promise.all([
      personIds.length
        ? this.prisma.person.findMany({
            where: { id: { in: personIds } },
            select: { id: true, name: true },
          })
        : [],
      paymentIds.length
        ? this.prisma.payment.findMany({
            where: { id: { in: paymentIds } },
            select: { id: true, refId: true, status: true },
          })
        : [],
    ]);
    const buyerNameOf = new Map(buyers.map((p) => [p.id, p.name]));
    const paymentOf = new Map(payments.map((p) => [p.id, p]));

    return codes.map((c) => {
      const r = c.redemptions[0] ?? null;
      const payment = r?.paymentId ? paymentOf.get(r.paymentId) : null;
      return {
        id: c.id,
        code: c.code,
        usedCount: c.usedCount,
        maxUses: c.maxUses,
        createdAt: c.createdAt,
        redemption: r
          ? {
              redeemedAt: r.redeemedAt,
              buyerName: buyerNameOf.get(r.personId) ?? null,
              paymentId: r.paymentId,
              paymentRefId: payment?.refId ?? null,
            }
          : null,
      };
    });
  }
}
