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
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import type { Request, Response } from "express";
import {
  QUERY_ROLES,
  type QueryFilters,
  type QueryRole,
  type SavedReportParams,
} from "@omnidance/shared";
import { SessionGuard } from "../auth/infrastructure/session.guard";
import { buildTablePdf } from "../common/pdf-report";
import { fmtCl } from "./entities/helpers";
import { toCsv } from "./producer-export";
import { QueryService } from "./query.service";
import { ApiQuery } from "@nestjs/swagger";

/**
 * Motor de consultas compartido (spec analytics/query-console):
 * catálogo por lente, opciones FK, preview (run), export CSV/PDF y
 * consultas guardadas. Auth = SessionGuard + check de lente aprobado
 * (mismo patrón que analytics - lentes, no permisos RBAC); el lente
 * PRODUCER además exige Producer Pro en catalog/run/export/options.
 */

class QueryRunDto {
  @IsIn([...QUERY_ROLES])
  role!: QueryRole;

  @IsString()
  @IsNotEmpty()
  entity!: string;

  @IsOptional()
  @IsObject()
  filters?: QueryFilters;
}

class SaveQueryDto {
  @IsIn([...QUERY_ROLES])
  role!: QueryRole;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsObject()
  params!: SavedReportParams;
}

class RenameSavedDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}

@Controller("query")
@UseGuards(SessionGuard)
export class QueryController {
  constructor(private readonly query: QueryService) {}

  /**
   * GET /query/catalog?role= — entidades consultables del lente con
   * filtros/columnas del catálogo shared + opciones FK resueltas y
   * plantillas del sistema.
   */
  @Get("catalog")
  catalog(@Req() req: Request, @Query("role") role = "") {
    return this.query.catalog(req.person!.id, role);
  }

  /**
   * GET /query/options?role=&source=&scopeId= — opciones de una fuente
   * FK; scopeId requerido en fuentes scope-dependientes (listas del
   * evento, planes/series/instructores de la academia).
   */
  @Get("options")
  @ApiQuery({ name: "scopeId", required: false })
  options(
    @Req() req: Request,
    @Query("role") role = "",
    @Query("source") source = "",
    @Query("scopeId") scopeId?: string,
  ) {
    return this.query.options(req.person!.id, role, source, scopeId);
  }

  /** POST /query/run — preview: headers + rows (≤50) + total + summary. */
  @Post("run")
  run(@Req() req: Request, @Body() dto: QueryRunDto) {
    return this.query.run(req.person!.id, dto);
  }

  /**
   * GET /query/export.csv?role=&entity=&<filtros> — resultado completo
   * (sin cap), BOM UTF-8 + CRLF, attachment.
   */
  @Get("export.csv")
  async exportCsv(
    @Req() req: Request,
    @Query() q: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const role = typeof q.role === "string" ? q.role : "";
    const entity = typeof q.entity === "string" ? q.entity : "";
    const { table } = await this.query.exportTable(
      req.person!.id,
      role,
      entity,
      withoutMeta(q),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${entity}-${stamp()}.csv"`,
    );
    return toCsv(table.headers, table.rows);
  }

  /**
   * GET /query/export.pdf?role=&entity=&<filtros> — reporte A4 con
   * título es-CL, resumen, header repetido y «Página X de Y».
   */
  @Get("export.pdf")
  async exportPdf(
    @Req() req: Request,
    @Query() q: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const role = typeof q.role === "string" ? q.role : "";
    const entity = typeof q.entity === "string" ? q.entity : "";
    const { title, table } = await this.query.exportTable(
      req.person!.id,
      role,
      entity,
      withoutMeta(q),
    );
    const pdf = await buildTablePdf({
      title,
      subtitle: `generado ${fmtCl(new Date())}`,
      summary: table.summary,
      headers: table.headers,
      rows: table.rows,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${entity}-${stamp()}.pdf"`,
    );
    return new StreamableFile(pdf);
  }

  // ─── Consultas guardadas ────────────────────────────────────────────

  /** GET /query/saved?role= — propias del lente + plantillas del sistema. */
  @Get("saved")
  saved(@Req() req: Request, @Query("role") role = "") {
    return this.query.listSaved(req.person!.id, role);
  }

  @Post("saved")
  createSaved(@Req() req: Request, @Body() dto: SaveQueryDto) {
    return this.query.createSaved(req.person!.id, dto);
  }

  @Patch("saved/:id")
  renameSaved(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() dto: RenameSavedDto,
  ) {
    return this.query.renameSaved(req.person!.id, id, dto.name);
  }

  @Delete("saved/:id")
  deleteSaved(@Req() req: Request, @Param("id") id: string) {
    return this.query.deleteSaved(req.person!.id, id);
  }
}

/** Params de filtro = query string menos las claves de control. */
function withoutMeta(q: Record<string, unknown>): Record<string, unknown> {
  const { role: _r, entity: _e, ...rest } = q;
  return rest;
}

const stamp = () => new Date().toISOString().slice(0, 10);
