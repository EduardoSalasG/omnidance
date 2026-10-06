import {
  Body,
  Controller,
  Delete,
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
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { Request, Response } from "express";
import type { ClaimStatus } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AcademyAccess } from "./academy-access.service";
import {
  AcademyClaimsService,
  CLAIM_MAX_BYTES,
  CLAIM_METHOD_TYPES,
} from "./academy-claims.service";
import { mimeForKey } from "../../storage/storage.service";

class CreateMethodDto {
  @IsIn([...CLAIM_METHOD_TYPES])
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

/**
 * Pagos directos alumno→academia (spec academy-payment-claims):
 * medios de pago configurables por el owner y cola de comprobantes.
 * El comprobante viaja multipart y se sirve por endpoint autenticado -
 * nunca por ruta estática (contiene datos bancarios del emisor).
 */
@Controller("academies")
@UseGuards(SessionGuard)
export class AcademyClaimsController {
  constructor(
    private readonly access: AcademyAccess,
    private readonly claims: AcademyClaimsService,
  ) {}

  /** Métodos activos de la academia - cualquier usuario con sesión. */
  @Get(":id/payment-methods")
  async listMethods(@Param("id") id: string) {
    const { academy } = await this.access.loadContext(id);
    return this.claims.listMethods(academy.id);
  }

  /** Todos los métodos (incluye inactivos) - solo owner/admin. */
  @Get(":id/payment-methods/admin")
  async listMethodsAdmin(@Param("id") id: string, @Req() req: Request) {
    const { academy } = await this.access.requireCapability(id, req.person!, "payments");
    return this.claims.listMethods(academy.id, { includeInactive: true });
  }

  @Post(":id/payment-methods")
  async createMethod(
    @Param("id") id: string,
    @Body() dto: CreateMethodDto,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.requireCapabilityWrite(
      id,
      req.person!,
      "payments",
    );
    return this.claims.createMethod(academy.id, dto);
  }

  @Patch(":id/payment-methods/:methodId")
  async updateMethod(
    @Param("id") id: string,
    @Param("methodId") methodId: string,
    @Body() dto: UpdateMethodDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "payments");
    return this.claims.updateMethod(id, methodId, dto);
  }

  @Delete(":id/payment-methods/:methodId")
  async deleteMethod(
    @Param("id") id: string,
    @Param("methodId") methodId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "payments");
    return this.claims.deleteMethod(id, methodId);
  }

  /**
   * POST /academies/:id/claims - multipart: `receipt` (imagen/PDF ≤5MB)
   * + campos `planId?`, `methodId?`, `amount`, `note?`. Crea el claim
   * PENDING enlazado al enrollment vigente y notifica al owner.
   */
  @Post(":id/claims")
  @UseInterceptors(
    FileInterceptor("receipt", { limits: { fileSize: CLAIM_MAX_BYTES } }),
  )
  async createClaim(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body("planId") planId: string | undefined,
    @Body("methodId") methodId: string | undefined,
    @Body("amount") amount: string,
    @Body("note") note: string | undefined,
    @Req() req: Request,
  ) {
    const { academy } = await this.access.loadContext(id);
    const parsedAmount = Number(amount);
    return this.claims.createClaim(
      academy.id,
      req.person!.id,
      file as Express.Multer.File,
      {
        planId: planId || undefined,
        methodId: methodId || undefined,
        amount: parsedAmount,
        note: note || undefined,
      },
      academy,
    );
  }

  /** Cola de validación del owner (ordenada, con ?status=PENDING). */
  @Get(":id/claims")
  async listClaims(
    @Param("id") id: string,
    @Query("status") status: ClaimStatus | undefined,
    @Req() req: Request,
  ) {
    await this.access.requireCapability(id, req.person!, "payments");
    return this.claims.listClaims(id, status);
  }

  /** Claims propios del alumno en esta academia. */
  @Get(":id/claims/mine")
  async myClaims(@Param("id") id: string, @Req() req: Request) {
    await this.access.loadContext(id);
    return this.claims.listMyClaims(id, req.person!.id);
  }

  /**
   * Stream autenticado del comprobante: owner/admin de la academia o el
   * dueño del claim. 403 para cualquier otro usuario con sesión.
   */
  @Get(":id/claims/:claimId/receipt")
  async receipt(
    @Param("id") id: string,
    @Param("claimId") claimId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const claim = await this.claims.loadClaimForReceipt(id, claimId);
    const isOwner = claim.personId === req.person!.id;
    if (!isOwner) {
      await this.access.requireCapability(id, req.person!, "payments");
    }
    const buffer = await this.claims.readReceipt(claim.receiptKey);
    res.setHeader("Content-Type", mimeForKey(claim.receiptKey));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  }

  /** Aprueba: Payment MANUAL PAID + vigencia extendida + notificación. */
  @Post(":id/claims/:claimId/approve")
  async approve(
    @Param("id") id: string,
    @Param("claimId") claimId: string,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "payments");
    return this.claims.approve(id, claimId, req.person!.id);
  }

  /** Rechaza con motivo obligatorio; el alumno lo ve. */
  @Post(":id/claims/:claimId/reject")
  async reject(
    @Param("id") id: string,
    @Param("claimId") claimId: string,
    @Body() dto: RejectClaimDto,
    @Req() req: Request,
  ) {
    await this.access.requireCapabilityWrite(id, req.person!, "payments");
    return this.claims.reject(id, claimId, req.person!.id, dto.note);
  }
}
