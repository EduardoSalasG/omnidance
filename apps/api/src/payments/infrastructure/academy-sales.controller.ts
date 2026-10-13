import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  AcademyNotApprovedError,
  AcademySalesService,
  DuplicateAgreementError,
} from "../application/academy-sales.service";

class CreateDealDto {
  /** Alcance XOR: eventId o seriesId (nunca ambos). */
  @IsOptional()
  @IsString()
  seriesId?: string;

  @IsString()
  academyId!: string;

  /** % del precio de lista por ticket que se lleva la academia (1-90). */
  @IsInt()
  @Min(1)
  @Max(90)
  commissionPct!: number;

  /** Cupo opcional: la atribución se apaga al llegar a maxTickets. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTickets?: number;
}

class PatchDealDto {
  /**
   * Academia: accept|decline (solo sobre acuerdos INVITED dirigidos a
   * ella). Productor: disable (mata la atribución futura, no las órdenes
   * ya pagadas) o edición de commissionPct/maxTickets (snapshot por
   * orden - solo ventas nuevas).
   */
  @IsOptional()
  @IsIn(["accept", "decline", "disable"])
  action?: "accept" | "decline" | "disable";

  @ValidateIf((d: PatchDealDto) => d.action == null)
  @IsInt()
  @Min(1)
  @Max(90)
  commissionPct?: number;

  /** null explícito limpia el cupo; con action se ignora. */
  @ValidateIf((d: PatchDealDto) => d.action == null && d.maxTickets !== null)
  @IsInt()
  @Min(1)
  maxTickets?: number | null;
}

class MarkPaidDto {
  /** Comprobante opcional de la transferencia (mismo patrón claims). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceUrl?: string;
}

/**
 * Preventa atribuida a academias (spec academy-presale-commission). La
 * plataforma registra la deuda productor→academia; el pago real se hace
 * por fuera y el productor lo marca acá.
 *
 * Rutas multi-prefijo a propósito: el acuerdo se crea/consulta en la
 * ficha del evento, la academia opera sobre academy-deals y la marca de
 * pago es una acción del acuerdo (la deuda pendiente es computada - no
 * existe fila settlement hasta marcarla).
 */
@Controller()
@UseGuards(SessionGuard)
export class AcademySalesController {
  constructor(private readonly sales: AcademySalesService) {}

  private mapError(e: unknown): never {
    if (e instanceof NotFoundException || e instanceof BadRequestException) {
      throw e;
    }
    if (e instanceof AcademyNotApprovedError) {
      throw new BadRequestException(e.message);
    }
    if (e instanceof DuplicateAgreementError) {
      throw new ConflictException(e.message);
    }
    throw e;
  }

  /** Productor invita una academia a vender la preventa del evento. */
  @Post("events/:id/academy-deals")
  async create(
    @Param("id") eventId: string,
    @Req() req: Request,
    @Body() dto: CreateDealDto,
  ) {
    try {
      return await this.sales.createAgreement(req.person!, {
        eventId,
        seriesId: dto.seriesId,
        academyId: dto.academyId,
        commissionPct: dto.commissionPct,
        maxTickets: dto.maxTickets,
      });
    } catch (e) {
      this.mapError(e);
    }
  }

  /**
   * Acuerdos visibles desde la ficha del evento: los propios + los de la
   * serie padre (también atribuyen ventas de este evento).
   */
  @Get("events/:id/academy-deals")
  async listForEvent(@Param("id") eventId: string, @Req() req: Request) {
    try {
      return await this.sales.listForEvent(eventId, req.person!);
    } catch (e) {
      this.mapError(e);
    }
  }

  /** Productor edita/desactiva; academia acepta/rechaza (INVITED). */
  @Patch("academy-deals/:id")
  async patch(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() dto: PatchDealDto,
  ) {
    try {
      return await this.sales.patchAgreement(id, req.person!, {
        action: dto.action,
        commissionPct: dto.commissionPct,
        maxTickets: dto.maxTickets,
      });
    } catch (e) {
      this.mapError(e);
    }
  }

  /** Vista academia: acuerdos, ventas, comisión devengada y estado de pago. */
  @Get("academies/:id/sale-deals")
  async listForAcademy(@Param("id") academyId: string, @Req() req: Request) {
    try {
      return await this.sales.listForAcademy(academyId, req.person!);
    } catch (e) {
      this.mapError(e);
    }
  }

  /**
   * El productor marca la deuda pendiente del acuerdo como pagada. El
   * settlement se materializa al marcar con el monto computado ahora -
   * ventas posteriores dejan remanente pendiente (design.md).
   */
  @Post("academy-deals/:id/mark-paid")
  async markPaid(
    @Param("id") id: string,
    @Req() req: Request,
    @Body() dto?: MarkPaidDto,
  ) {
    try {
      return await this.sales.markPaid(id, req.person!, dto?.evidenceUrl);
    } catch (e) {
      this.mapError(e);
    }
  }
}
