import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsOptional, Min } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { ParamsService } from "../../params/params.service";

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
}

const TABLE_FIELDS = [
  "tablesTotal",
  "tableSeatMax",
  "tableSeatsTotal",
] as const;

/**
 * Vista read-only del productor: sus defaults de fees (ProducerParams,
 * seteados por admin) y los valores efectivos que se cobrarán en sus
 * eventos — presale, puerta app, puerta efectivo y % comisión plataforma.
 * El productor no puede editarlos (spec: solo admin).
 *
 * A diferencia de los fees, los defaults de MESAS sí los edita el propio
 * productor (table-params): son operativos, no financieros — cada evento
 * los hereda al crear/editar salvo override explícito.
 */
@Controller("producer")
@UseGuards(SessionGuard)
export class ProducerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  @Get("fee-params")
  async feeParams(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);

    const defaults = await this.params.getProducerParams(me.id);
    const [presale, doorApp, doorCash, platformPct] = await Promise.all([
      this.params.getNumber("service_fee.presale_clp", 500),
      this.params.getNumber("service_fee.door_app_clp", 700),
      this.params.getNumber("service_fee.door_cash_clp", 0),
      this.params.getNumber("platform_fee.default_pct", 0),
    ]);
    return {
      defaults: defaults ?? {
        serviceFeeClp: null,
        doorAppFeeClp: null,
        doorCashFeeClp: null,
        platformFeePct: null,
        tablesTotal: null,
        tableSeatMax: null,
        tableSeatsTotal: null,
      },
      effective: {
        serviceFeeClp: defaults?.serviceFeeClp ?? presale,
        doorAppFeeClp: defaults?.doorAppFeeClp ?? doorApp,
        doorCashFeeClp: defaults?.doorCashFeeClp ?? doorCash,
        platformFeePct: defaults?.platformFeePct ?? platformPct,
      },
    };
  }

  /**
   * Defaults de mesas del productor (spec checkout-table-reservation):
   * mesas ofrecidas, tope por reserva y cupo sentable. Los eventos los
   * heredan al crear/editar; null en un campo = sin default propio.
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

  /** productor APPROVED o admin.access — permiso desde DB, nunca rol literal. */
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
