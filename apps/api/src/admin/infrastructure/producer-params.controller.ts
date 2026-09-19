import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { ParamsService } from "../../params/params.service";

class ProducerFeeParamsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  serviceFeeClp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  doorAppFeeClp?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  doorCashFeeClp?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformFeePct?: number | null;
}

const FEE_FIELDS = [
  "serviceFeeClp",
  "doorAppFeeClp",
  "doorCashFeeClp",
  "platformFeePct",
] as const;

/**
 * Defaults de fees/comisiones por productor (spec parametrización):
 * el admin fija los valores base que heredan los eventos del productor
 * (cadena: override del evento → estos defaults → PlatformParam global).
 * Todo cambio queda en AuditLog (PRODUCER_PARAMS_SET) y el productor solo
 * los ve en modo lectura desde su consola.
 */
@Controller("admin/producers")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminProducerParamsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: ParamsService,
  ) {}

  /** Personas con rol PRODUCER aprobado — para elegir a quién configurar. */
  @Get()
  async producers() {
    const roles = await this.prisma.personRole.findMany({
      where: { role: "PRODUCER", status: "APPROVED" },
      select: {
        person: { select: { id: true, name: true, email: true } },
      },
      orderBy: { person: { name: "asc" } },
    });
    const params = await this.prisma.producerParams.findMany({
      select: { producerId: true },
    });
    const configured = new Set(params.map((p) => p.producerId));
    return roles.map((r) => ({
      ...r.person,
      hasCustomParams: configured.has(r.person.id),
    }));
  }

  /** Defaults del productor + valores efectivos resueltos (para el admin). */
  @Get(":id/fee-params")
  async get(@Param("id") producerId: string) {
    await this.assertProducer(producerId);
    return this.buildView(producerId);
  }

  /** Upsert de defaults — null en un campo vuelve a heredar el global. */
  @Put(":id/fee-params")
  async set(
    @Param("id") producerId: string,
    @Body() dto: ProducerFeeParamsDto,
    @Req() req: Request,
  ) {
    await this.assertProducer(producerId);
    const data: Record<string, number | null> = {};
    for (const f of FEE_FIELDS) {
      if (dto[f] !== undefined) data[f] = dto[f] ?? null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("envía al menos un campo de fee");
    }

    await this.prisma.producerParams.upsert({
      where: { producerId },
      update: { ...data, updatedById: req.person!.id },
      create: {
        producerId,
        ...data,
        updatedById: req.person!.id,
      } as Prisma.ProducerParamsUncheckedCreateInput,
    });
    this.params.invalidateProducer(producerId);
    await this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action: "PRODUCER_PARAMS_SET",
        targetType: "ProducerParams",
        targetId: producerId,
        payload: data as Prisma.InputJsonValue,
      },
    });
    return this.buildView(producerId);
  }

  private async assertProducer(producerId: string) {
    const role = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId: producerId, role: "PRODUCER" } },
    });
    if (!role || role.status !== "APPROVED") {
      throw new NotFoundException("productor no encontrado");
    }
  }

  /**
   * Vista del admin: defaults guardados + resolución efectiva de cada fee
   * (default del productor ?? param global), para que se vea el valor que
   * en realidad se cobrará.
   */
  private async buildView(producerId: string) {
    const defaults = await this.params.getProducerParams(producerId);
    const [presale, doorApp, doorCash, platformPct] = await Promise.all([
      this.params.getNumber("service_fee.presale_clp", 500),
      this.params.getNumber("service_fee.door_app_clp", 700),
      this.params.getNumber("service_fee.door_cash_clp", 0),
      this.params.getNumber("platform_fee.default_pct", 0),
    ]);
    return {
      producerId,
      defaults: defaults ?? {
        serviceFeeClp: null,
        doorAppFeeClp: null,
        doorCashFeeClp: null,
        platformFeePct: null,
      },
      effective: {
        serviceFeeClp: defaults?.serviceFeeClp ?? presale,
        doorAppFeeClp: defaults?.doorAppFeeClp ?? doorApp,
        doorCashFeeClp: defaults?.doorCashFeeClp ?? doorCash,
        platformFeePct: defaults?.platformFeePct ?? platformPct,
      },
    };
  }
}
