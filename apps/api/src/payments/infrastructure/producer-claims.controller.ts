import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { Request, Response } from "express";
import type { ClaimStatus } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { roleKeysHavePermission } from "../../common/rbac/roles.guard";
import {
  ProducerClaimsService,
  CLAIM_MAX_BYTES,
  PRODUCER_METHOD_TYPES,
} from "./producer-claims.service";
import { mimeForKey } from "../../storage/storage.service";
import { pageParams } from "../../academies/infrastructure/list-filters";
import { ApiPropertyOptional } from "@nestjs/swagger";

class CreateMethodDto {
  @IsIn([...PRODUCER_METHOD_TYPES])
  type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label!: string;

  @IsObject()
  details!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  order?: number;
}

class UpdateMethodDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

class RejectClaimDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}

const CLAIM_STATUSES: readonly ClaimStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "AWAITING",
];

/**
 * Filtros de `GET /producer/claims` - contrato compartido de la barra de
 * filtros (spec analytics/query-console): `status` whitelist del enum
 * ClaimStatus (inválido → 400; antes pasaba crudo a Prisma → 500),
 * `from`/`to` sobre createdAt. Opcionales/aditivos.
 */
class ListClaimsQueryDto {
  @IsOptional()
  @IsIn(CLAIM_STATUSES)
  @ApiPropertyOptional()
  status?: ClaimStatus;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  to?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  page?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  pageSize?: string;
}

/**
 * Métodos propios del productor + cola de comprobantes (spec
 * producer-own-methods): espejo del patrón de academias
 * (academy-payment-claims). El comprobante viaja multipart y se sirve
 * por endpoint autenticado - nunca por ruta estática (datos bancarios
 * del emisor).
 */
@Controller()
@UseGuards(SessionGuard)
export class ProducerClaimsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claims: ProducerClaimsService,
  ) {}

  /** productor APPROVED o admin.access - permiso desde DB. */
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

  // ── Métodos de cobro del productor ─────────────────────────────────

  /** Métodos del propio productor (incluye inactivos - admin de la consola). */
  @Get("producer/payment-methods")
  async listMyMethods(@Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.listMethods(me.id, { includeInactive: true });
  }

  @Post("producer/payment-methods")
  async createMethod(@Req() req: Request, @Body() dto: CreateMethodDto) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.createMethod(me.id, dto);
  }

  @Patch("producer/payment-methods/:methodId")
  async updateMethod(
    @Param("methodId") methodId: string,
    @Body() dto: UpdateMethodDto,
    @Req() req: Request,
  ) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.updateMethod(me.id, methodId, dto);
  }

  @Delete("producer/payment-methods/:methodId")
  async deleteMethod(
    @Param("methodId") methodId: string,
    @Req() req: Request,
  ) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.deleteMethod(me.id, methodId);
  }

  /**
   * Métodos activos del productor dueño del evento - cualquier usuario
   * con sesión (el checkout los lista como opción de pago). Eventos
   * sin productor → [].
   */
  @Get("events/:id/payment-methods")
  async methodsForEvent(@Param("id") eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { producerId: true },
    });
    if (!event?.producerId) return { methods: [] };
    return { methods: await this.claims.listMethods(event.producerId) };
  }

  // ── Claims del comprador ───────────────────────────────────────────

  /**
   * POST /payments/:id/claims - multipart: `receipt` (imagen/PDF ≤5MB)
   * + `methodId?`, `note?`. Solo el dueño de la orden y solo sobre
   * órdenes MANUAL PENDING.
   */
  @Post("payments/:id/claims")
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: CLAIM_MAX_BYTES } }),
  )
  async createClaim(
    @Param("id") paymentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("methodId") methodId: string | undefined,
    @Body("note") note: string | undefined,
    @Req() req: Request,
  ) {
    return this.claims.createClaim(
      paymentId,
      req.person!.id,
      file as Express.Multer.File,
      { methodId: methodId || undefined, note: note || undefined },
    );
  }

  /** Claims propios del comprador sobre la orden. */
  @Get("payments/:id/claims")
  async myClaims(@Param("id") paymentId: string, @Req() req: Request) {
    return {
      claims: await this.claims.listClaimsOfPayment(
        paymentId,
        req.person!.id,
      ),
    };
  }

  // ── Cola del productor ─────────────────────────────────────────────

  @Get("producer/claims")
  async listClaims(@Query() dto: ListClaimsQueryDto, @Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    const pg = pageParams(dto.page, dto.pageSize);
    const res = await this.claims.listClaims(
      me.id,
      {
        status: dto.status,
        from: dto.from ? new Date(dto.from) : undefined,
        to: dto.to ? new Date(dto.to) : undefined,
      },
      pg,
    );
    return { claims: res.items, total: res.total, page: pg.page, pageSize: pg.pageSize };
  }

  /** Ficha del comprobante (detalle de la cola del productor). */
  @Get("producer/claims/:claimId")
  async claimDetail(@Param("claimId") claimId: string, @Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    const claim = await this.claims.claimDetail(me.id, claimId);
    return claim;
  }

  /** Stream autenticado del comprobante: comprador dueño, productor o admin. */
  @Get("producer/claims/:claimId/receipt")
  async receipt(
    @Param("claimId") claimId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const claim = await this.claims.loadClaimForReceipt(claimId);
    const me = req.person!;
    if (claim.personId !== me.id && claim.producerId !== me.id) {
      const isAdmin = await roleKeysHavePermission(this.prisma, me.roles, [
        "admin.access",
      ]);
      this.claims.assertCanView(claim, me.id, isAdmin);
    }
    const buffer = await this.claims.readReceipt(claim.receiptKey);
    res.setHeader("Content-Type", mimeForKey(claim.receiptKey));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }

  /** Aprueba: la orden se liquida por el mismo settle del webhook. */
  @Post("producer/claims/:claimId/approve")
  async approve(@Param("claimId") claimId: string, @Req() req: Request) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.approve(me.id, claimId, me.id);
  }

  /** Rechaza con motivo obligatorio; el comprador lo ve. */
  @Post("producer/claims/:claimId/reject")
  async reject(
    @Param("claimId") claimId: string,
    @Body() dto: RejectClaimDto,
    @Req() req: Request,
  ) {
    const me = req.person!;
    await this.assertProducerOrAdmin(me.id, me.roles);
    return this.claims.reject(me.id, claimId, me.id, dto.note);
  }
}
