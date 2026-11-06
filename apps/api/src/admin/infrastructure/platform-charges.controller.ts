import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { PlatformChargesService } from "../../payments/application/platform-charges.service";

class CreatePlatformChargeDto {
  @IsString()
  @IsNotEmpty()
  personId!: string;

  /** Monto del cobro en unidad menor (CLP), entero positivo. */
  @IsInt()
  @Min(1)
  amount!: number;

  /** Concepto del cobro - viaja al proveedor y queda en el ledger. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  subject!: string;
}

/**
 * Cobros sueltos plataforma→actor (spec payments/platform-charges):
 * `POST /admin/platform-charges` gatilla `provider.collect()` sobre el
 * medio de pago registrado de la persona. Responde el outcome del
 * proveedor: COLLECTED (Payment PAID), FAILED (rechazado) o PENDING
 * con `paymentUrl` para compartir el link cuando no hay tarjeta.
 */
@Controller("admin/platform-charges")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminPlatformChargesController {
  constructor(private readonly charges: PlatformChargesService) {}

  @Post()
  create(@Body() dto: CreatePlatformChargeDto, @Req() req: Request) {
    return this.charges.collect({
      personId: dto.personId,
      amount: dto.amount,
      subject: dto.subject,
      actor: "admin",
      adminId: req.person!.id,
    });
  }
}
