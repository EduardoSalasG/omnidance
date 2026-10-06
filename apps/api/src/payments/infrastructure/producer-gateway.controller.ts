import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import { GatewayAccountsService } from "../application/gateway-accounts.service";

class GatewayAccountDto {
  /** FLOW | MERCADOPAGO (STUB solo fuera de producción, para dev). */
  @IsIn(["FLOW", "MERCADOPAGO", "STUB"])
  provider!: string;

  /** FLOW: apiKey · MERCADOPAGO: access token · STUB: cualquier string. */
  @IsString()
  @MaxLength(200)
  apiKey!: string;

  /** FLOW: secret key. Obligatorio para FLOW, ignorado en MP/STUB. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  secret?: string;
}

/**
 * Pasarela propia del productor (spec producer-gateway-accounts): alta,
 * vista y baja de la cuenta Flow/MP que cobra sus ventas. Las
 * credenciales viajan solo en el PUT (TLS) y se persisten cifradas -
 * ninguna respuesta las devuelve. La comisión de plataforma se devenga
 * igual y se netea en el payout (feeMode OWN_GATEWAY).
 */
@Controller("producer/gateway-account")
@UseGuards(SessionGuard)
export class ProducerGatewayAccountsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: GatewayAccountsService,
  ) {}

  @Get()
  async view(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return { account: await this.accounts.viewForProducer(me.id) };
  }

  @Put()
  async upsert(@Req() req: Request, @Body() dto: GatewayAccountDto) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    if (!dto.apiKey?.trim()) {
      throw new BadRequestException("apiKey requerido");
    }
    const account = await this.accounts.upsert(me.id, dto);
    return { account };
  }

  @Delete()
  async disable(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    const account = await this.accounts.viewForProducer(me.id);
    if (account) await this.accounts.disable(account.id, me.id);
    return { account: await this.accounts.viewForProducer(me.id) };
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
