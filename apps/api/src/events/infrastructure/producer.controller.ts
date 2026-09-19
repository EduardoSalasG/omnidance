import {
  Controller,
  ForbiddenException,
  Get,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { ParamsService } from "../../params/params.service";

/**
 * Vista read-only del productor: sus defaults de fees (ProducerParams,
 * seteados por admin) y los valores efectivos que se cobrarán en sus
 * eventos — presale, puerta app, puerta efectivo y % comisión plataforma.
 * El productor no puede editarlos (spec: solo admin).
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
    const [isProducer, isAdmin] = await Promise.all([
      this.prisma.personRole.findUnique({
        where: {
          personId_role: { personId: me.id, role: "PRODUCER" },
        },
      }),
      roleKeysHavePermission(this.prisma, me.roles, ["admin.access"]),
    ]);
    if (!isAdmin && isProducer?.status !== "APPROVED") {
      throw new ForbiddenException("requiere rol de productor aprobado");
    }

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
