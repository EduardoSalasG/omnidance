import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { ParamsService } from "../../params/params.service";
import { PRESALE_CUTOFF_MAX_MINUTES } from "../../common/presale-cutoff";

class ProducerTableParamsDto {
  /** Mesas reservables por defecto en sus eventos; null = no ofrecer. */
  @IsOptional()
  @IsInt()
  @Min(0)
  tablesTotal?: number | null;

  /** Máx. personas por reserva de mesa; null = sin tope propio. */
  @IsOptional()
  @IsInt()
  @Min(1)
  tableSeatMax?: number | null;

  /** Cupo sentable total en mesas (usualmente < aforo del evento). */
  @IsOptional()
  @IsInt()
  @Min(0)
  tableSeatsTotal?: number | null;

  /**
   * Default del corte de preventa (minutos desde medianoche del día del
   * evento; >1439 = post-medianoche). null → param global. Sus eventos
   * lo heredan salvo override propio.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(PRESALE_CUTOFF_MAX_MINUTES)
  presaleCutoffMinutes?: number | null;
}

class AddCollaboratorDto {
  /** Alta por persona existente (viene de la búsqueda por nombre). */
  @IsOptional()
  @IsString()
  personId?: string;

  /** Alta directa por correo (persona ya registrada). */
  @IsOptional()
  @IsEmail()
  email?: string;
}

// Defaults operativos auto-editables del productor (mesas + corte de
// preventa); los financieros (fees) siguen siendo solo de admin.
const TABLE_FIELDS = [
  "tablesTotal",
  "tableSeatMax",
  "tableSeatsTotal",
  "presaleCutoffMinutes",
] as const;

/**
 * Vista read-only del productor: sus defaults financieros (ProducerParams,
 * seteados por admin) y la comisión todo incluido efectiva que se cobrará
 * en sus eventos (spec producer-fee-model). El productor no puede
 * editarlos (spec: solo admin).
 *
 * A diferencia de los fees, los defaults de MESAS sí los edita el propio
 * productor (table-params): son operativos, no financieros - cada evento
 * los hereda al crear/editar salvo override explícito.
 */
@Controller("producer")
@UseGuards(SessionGuard)
export class ProducerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  /**
   * GET /producer/dashboard - home del productor (mismo formato del
   * dashboard del owner: KPIs + listas operativas). Agrega sobre TODOS
   * sus eventos: los agendados (PUBLISHED/LIVE a futuro) y el mes
   * calendario en curso para ventas/facturación.
   *
   * - kpis.upcoming: eventos agendados aún abiertos o por venir.
   * - kpis.sold: entradas ACTIVE|USED de esos eventos agendados.
   * - kpis.grossMonth: bruto PAID (orderType TICKET) del mes calendario.
   * - kpis.pendingClaims: comprobantes manuales esperando revisión.
   * - topRevenue / topAttendance: top 5 eventos del productor por bruto
   *   PAID histórico y por check-ins (voidedAt null).
   * - pendingClaims.items: primeros 5 de la cola PENDING (persona,
   *   método, monto) - la acción vive en /productor/comprobantes.
   */
  @Get("dashboard")
  async dashboard(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const events = await this.prisma.event.findMany({
      where: { producerId: me.id },
      select: { id: true, status: true, endsAt: true },
    });
    const allIds = events.map((e) => e.id);
    const upcomingIds = events
      .filter(
        (e) =>
          (e.status === "PUBLISHED" || e.status === "LIVE") &&
          e.endsAt >= now,
      )
      .map((e) => e.id);
    if (!allIds.length) {
      return {
        kpis: { upcoming: 0, sold: 0, grossMonth: 0, pendingClaims: 0 },
        topRevenue: [],
        topAttendance: [],
        pendingClaims: { count: 0, amount: 0, items: [] },
      };
    }

    const [sold, grossMonth, revenueBy, checkinsBy, claimsCount, claimsSum, claims] =
      await Promise.all([
        upcomingIds.length
          ? this.prisma.ticket.count({
              where: {
                eventId: { in: upcomingIds },
                status: { in: ["ACTIVE", "USED"] },
              },
            })
          : 0,
        this.prisma.payment.aggregate({
          where: {
            eventId: { in: allIds },
            orderType: "TICKET",
            status: "PAID",
            createdAt: { gte: monthStart },
          },
          _sum: { amount: true },
        }),
        this.prisma.payment.groupBy({
          by: ["eventId"],
          where: {
            eventId: { in: allIds },
            orderType: "TICKET",
            status: "PAID",
          },
          _sum: { amount: true },
          orderBy: { _sum: { amount: "desc" } },
          take: 5,
        }),
        this.prisma.checkin.groupBy({
          by: ["eventId"],
          where: { eventId: { in: allIds }, voidedAt: null },
          _count: { _all: true },
          orderBy: { _count: { eventId: "desc" } },
          take: 5,
        }),
        this.prisma.ticketClaim.count({
          where: { producerId: me.id, status: "PENDING" },
        }),
        this.prisma.payment.aggregate({
          where: {
            ticketClaims: {
              some: { producerId: me.id, status: "PENDING" },
            },
          },
          _sum: { amount: true },
        }),
        this.prisma.ticketClaim.findMany({
          where: { producerId: me.id, status: "PENDING" },
          orderBy: { createdAt: "asc" },
          take: 5,
          select: {
            id: true,
            methodLabel: true,
            createdAt: true,
            person: { select: { name: true } },
            payment: { select: { amount: true } },
          },
        }),
      ]);

    const topIds = [
      ...new Set([
        ...revenueBy.map((r) => r.eventId),
        ...checkinsBy.map((c) => c.eventId),
      ]),
    ].filter((id): id is string => id != null);
    const topEvents = topIds.length
      ? await this.prisma.event.findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, startsAt: true },
        })
      : [];
    const evById = new Map(topEvents.map((e) => [e.id, e]));

    return {
      kpis: {
        upcoming: upcomingIds.length,
        sold,
        grossMonth: grossMonth._sum.amount ?? 0,
        pendingClaims: claimsCount,
      },
      topRevenue: revenueBy
        .filter((r) => r.eventId != null && evById.has(r.eventId))
        .map((r) => ({
          id: r.eventId as string,
          name: evById.get(r.eventId as string)!.name,
          startsAt: evById.get(r.eventId as string)!.startsAt,
          grossClp: r._sum.amount ?? 0,
        })),
      topAttendance: checkinsBy
        .filter((c) => c.eventId != null && evById.has(c.eventId))
        .map((c) => ({
          id: c.eventId as string,
          name: evById.get(c.eventId as string)!.name,
          startsAt: evById.get(c.eventId as string)!.startsAt,
          checkins: c._count._all,
        })),
      pendingClaims: {
        count: claimsCount,
        amount: claimsSum._sum.amount ?? 0,
        items: claims.map((c) => ({
          id: c.id,
          personName: c.person.name,
          methodLabel: c.methodLabel,
          amount: c.payment.amount,
          createdAt: c.createdAt,
        })),
      },
    };
  }

  @Get("fee-params")
  async feeParams(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);

    const defaults = await this.params.getProducerParams(me.id);
    // Modelo all-in (spec producer-fee-model): el único fee financiero es
    // la comisión todo incluido - cadena productor → fees.managed_allin_pct.
    const allinPct = await this.params.getNumber("fees.managed_allin_pct", 10);
    return {
      defaults: defaults ?? {
        platformFeePct: null,
        tablesTotal: null,
        tableSeatMax: null,
        tableSeatsTotal: null,
      },
      effective: {
        platformFeePct: defaults?.platformFeePct ?? allinPct,
      },
    };
  }

  /**
   * Defaults operativos del productor: mesas (spec
   * checkout-table-reservation) y corte de preventa (spec
   * event-presale-cutoff). Los eventos los heredan al crear/editar;
   * null en un campo = sin default propio.
   */
  @Get("table-params")
  async getTableParams(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    const defaults = await this.params.getProducerParams(me.id);
    return {
      tablesTotal: defaults?.tablesTotal ?? null,
      tableSeatMax: defaults?.tableSeatMax ?? null,
      tableSeatsTotal: defaults?.tableSeatsTotal ?? null,
      presaleCutoffMinutes: defaults?.presaleCutoffMinutes ?? null,
    };
  }

  @Put("table-params")
  async setTableParams(
    @Req() req: Request,
    @Body() dto: ProducerTableParamsDto,
  ) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);

    const data: Record<string, number | null> = {};
    for (const f of TABLE_FIELDS) {
      if (dto[f] !== undefined) data[f] = dto[f] ?? null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("envía al menos un campo de mesas");
    }

    await this.prisma.producerParams.upsert({
      where: { producerId: me.id },
      update: { ...data, updatedById: me.id },
      create: { producerId: me.id, ...data, updatedById: me.id },
    });
    this.params.invalidateProducer(me.id);
    return this.getTableParams(req);
  }

  /**
   * Nómina de colaboradores del productor: el pool del que sale el staff
   * de sus eventos (GET /events/:id/staff/candidates). Cada productor
   * administra solo su propia nómina (producerId = me.id); ProducerStaff
   * es FK plana → join manual a Person.
   */
  @Get("staff")
  async listStaff(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    const rows = await this.prisma.producerStaff.findMany({
      where: { producerId: me.id },
      orderBy: { createdAt: "asc" },
    });
    const people = await this.prisma.person.findMany({
      where: { id: { in: rows.map((r) => r.personId) } },
      select: { id: true, name: true, email: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    return rows
      .map((r) => ({
        id: r.id,
        person: byId.get(r.personId) ?? {
          id: r.personId,
          name: null,
          email: null,
          photoUrl: null,
        },
      }))
      .sort((a, b) =>
        (a.person.name ?? "").localeCompare(b.person.name ?? "", "es"),
      );
  }

  /**
   * Agrega un colaborador a la nómina: por personId (selección de la
   * búsqueda por nombre) o por email directo. Upsert - reenviar no
   * duplica. No puedes agregarte a ti mismo.
   */
  @Post("staff")
  async addStaff(@Body() dto: AddCollaboratorDto, @Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    if (!dto.personId && !dto.email) {
      throw new BadRequestException("envía personId o email");
    }
    const person = await this.prisma.person.findFirst({
      where: dto.personId ? { id: dto.personId } : { email: dto.email! },
      select: { id: true, name: true, email: true, photoUrl: true },
    });
    if (!person) throw new NotFoundException("persona no encontrada");
    if (person.id === me.id) {
      throw new BadRequestException("no puedes agregarte como colaborador");
    }
    const row = await this.prisma.producerStaff.upsert({
      where: {
        producerId_personId: { producerId: me.id, personId: person.id },
      },
      create: { producerId: me.id, personId: person.id },
      update: {},
    });
    return { id: row.id, person };
  }

  /** Quita un colaborador de la nómina (idempotente). */
  @Delete("staff/:personId")
  async removeStaff(@Param("personId") personId: string, @Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    await this.prisma.producerStaff.deleteMany({
      where: { producerId: me.id, personId },
    });
    return { ok: true };
  }

  /** productor APPROVED o admin.access - permiso desde DB, nunca rol literal. */
  private async assertProducerOrAdmin(personId: string, roles: string[]) {
    const [isProducer, isAdmin] = await Promise.all([
      this.prisma.personRole.findUnique({
        where: { personId_role: { personId, role: "PRODUCER" } },
      }),
      roleKeysHavePermission(this.prisma, roles, ["admin.access"]),
    ]);
    if (!isAdmin && isProducer?.status !== "APPROVED") {
      throw new ForbiddenException("requiere rol de productor aprobado");
    }
  }
}
