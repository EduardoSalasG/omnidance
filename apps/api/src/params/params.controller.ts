import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { RequirePermissions } from "../common/rbac/roles.decorator";
import { RolesGuard } from "../common/rbac/roles.guard";
import { PrismaService } from "../prisma.service";
import { ParamsService } from "./params.service";

// Whitelist de params legibles sin sesión: lo que el cliente necesita para
// estimar precios y ventanas antes de operar. Datos sensibles quedan fuera.
const PUBLIC_KEYS = new Set([
  // Los keys service_fee.* quedaron fuera del modelo (spec
  // producer-fee-model): el comprador paga el precio publicado exacto y
  // la comisión all-in la paga el productor - nada que estimar en cliente.
  "session.cooldown_minutes",
  "qr.rotation_seconds",
  "prime_time.window_minutes",
  "prime_time.threshold_pct",
  // Catálogo público de tiers SaaS (spec academy-saas-billing): precios y
  // límites que muestra el checkout de contratación. academy_billing.* y
  // gateway_fee.* quedan internos (lógica de mora/payout, no pricing).
  "academy_tier.starter_max_students",
  "academy_tier.pro_max_students",
  "academy_tier.studio_max_students",
  "academy_tier.starter_monthly_clp",
  "academy_tier.starter_semiannual_clp",
  "academy_tier.starter_annual_clp",
  "academy_tier.pro_monthly_clp",
  "academy_tier.pro_semiannual_clp",
  "academy_tier.pro_annual_clp",
  "academy_tier.studio_monthly_clp",
  "academy_tier.studio_semiannual_clp",
  "academy_tier.studio_annual_clp",
  "producer_tier.starter_max_monthly_clp",
  "producer_tier.growth_max_monthly_clp",
  "producer_tier.starter_monthly_clp",
  "producer_tier.starter_semiannual_clp",
  "producer_tier.starter_annual_clp",
  "producer_tier.growth_monthly_clp",
  "producer_tier.growth_semiannual_clp",
  "producer_tier.growth_annual_clp",
]);

@Controller("params")
export class PublicParamsController {
  constructor(private readonly params: ParamsService) {}

  @Get("public")
  async public() {
    const all = await this.params.list();
    return Object.fromEntries(
      all.filter((p) => PUBLIC_KEYS.has(p.key)).map((p) => [p.key, p.value]),
    );
  }
}

// Consola admin: lectura y escritura de todos los parámetros + audit trail.
@Controller("admin/params")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminParamsController {
  constructor(
    private readonly params: ParamsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list() {
    return this.params.list();
  }

  @Put(":key")
  async set(
    @Param("key") key: string,
    @Body() body: { value?: unknown; description?: string },
    @Req() req: Request,
  ) {
    if (body?.value === undefined) {
      throw new BadRequestException("value requerido");
    }
    if (!/^[a-z0-9_.-]+$/i.test(key)) {
      throw new BadRequestException("key inválida");
    }

    const prev = await this.params.get(key);
    const row = await this.params.set(key, body.value, req.person!.id);
    if (body.description !== undefined) {
      await this.prisma.platformParam.update({
        where: { key },
        data: { description: body.description },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action: "PARAM_UPDATE",
        targetType: "PlatformParam",
        targetId: key,
        payload: {
          prev: prev as Prisma.InputJsonValue,
          next: body.value as Prisma.InputJsonValue,
        },
      },
    });
    return row;
  }
}
