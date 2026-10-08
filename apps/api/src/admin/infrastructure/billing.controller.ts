import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { AdminBillingService } from "../application/billing.service";

class GenerateDto {
  @IsString()
  @IsNotEmpty()
  payoutId!: string;
}

class VoidDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

class ListQueryDto {
  @IsOptional()
  @IsIn(["ISSUED", "VOID"])
  status?: string;

  @IsOptional()
  @IsString()
  personId?: string;

  // Convención del query engine: rango ISO sobre issuedAt (400 si no
  // parsea - el pipe valida @IsISO8601).
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

const pdfHeaders = (res: Response, folio: number, length: number) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", length);
  res.setHeader(
    "Content-Disposition",
    `inline; filename="nota-cobro-${folio}.pdf"`,
  );
  res.setHeader("Cache-Control", "private, no-store");
};

/**
 * Consola de facturación (spec admin-billing-documents): emisión
 * idempotente de notas de cobro internas por liquidación, listado,
 * descarga del PDF y anulación con motivo. Todo bajo admin.access.
 */
@Controller("admin/billing")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Post("generate")
  generate(@Body() dto: GenerateDto, @Req() req: Request) {
    return this.billing.generate(dto.payoutId, req.person!.id);
  }

  @Get("candidates")
  candidates() {
    return this.billing.candidates();
  }

  @Get()
  list(@Query() q: ListQueryDto) {
    return this.billing.list({
      status: q.status,
      receiverId: q.personId,
      from: q.from,
      to: q.to,
    });
  }

  @Get(":id/pdf")
  async pdf(@Param("id") id: string, @Res() res: Response) {
    const { doc, buffer } = await this.billing.pdfBuffer(id);
    pdfHeaders(res, doc.folio, buffer.length);
    res.end(buffer);
  }

  @Post(":id/void")
  void(@Param("id") id: string, @Body() dto: VoidDto, @Req() req: Request) {
    return this.billing.void(id, dto.reason, req.person!.id);
  }
}

/**
 * Vista del actor: sus propias notas de cobro ISSUED y su PDF.
 */
@Controller("me/billing")
@UseGuards(SessionGuard)
export class MeBillingController {
  constructor(private readonly billing: AdminBillingService) {}

  @Get()
  list(@Req() req: Request) {
    return this.billing.listMine(req.person!.id);
  }

  @Get(":id/pdf")
  async pdf(
    @Param("id") id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { doc, buffer } = await this.billing.pdfBuffer(id, req.person!.id);
    pdfHeaders(res, doc.folio, buffer.length);
    res.end(buffer);
  }
}
