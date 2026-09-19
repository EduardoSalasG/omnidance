import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import type { Request } from "express";
import type { Genre, Prisma } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

const GENRES: Genre[] = ["SALSA", "BACHATA", "CUBANO", "OTHER"];

class StyleDto {
  @IsString()
  name!: string;

  @IsIn(GENRES)
  genre!: Genre;
}

class StylePatchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(GENRES)
  genre?: Genre;
}

class LevelDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

class TypeDto {
  @IsString()
  name!: string;
}

/**
 * Mantenedor de catálogos de clases/estilos — los valores que usan las
 * academias para definir sus series (nivel, tipo, estilo de baile) viven
 * en DB y solo los edita un admin. Borrar un valor referenciado por una
 * serie/persona se rechaza con 409 (primero hay que reasignar).
 */
@Controller("admin/catalogs")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class CatalogsController {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Estilos ─────────────────────────────────────────────────────────

  @Get("styles")
  styles() {
    return this.prisma.style.findMany({
      orderBy: [{ genre: "asc" }, { name: "asc" }],
      select: { id: true, name: true, genre: true },
    });
  }

  @Post("styles")
  async createStyle(@Body() dto: StyleDto, @Req() req: Request) {
    const dup = await this.prisma.style.findFirst({
      where: { name: { equals: dto.name, mode: "insensitive" } },
    });
    if (dup) throw new ConflictException("ya existe un estilo con ese nombre");
    const style = await this.prisma.style.create({ data: dto });
    await this.audit(req, "STYLE_CREATE", "Style", style.id, dto);
    return style;
  }

  @Patch("styles/:id")
  async updateStyle(
    @Param("id") id: string,
    @Body() dto: StylePatchDto,
    @Req() req: Request,
  ) {
    await this.findOr404("style", id);
    const style = await this.prisma.style.update({ where: { id }, data: dto });
    await this.audit(req, "STYLE_UPDATE", "Style", id, dto as Prisma.InputJsonValue);
    return style;
  }

  @Delete("styles/:id")
  @HttpCode(200)
  async deleteStyle(@Param("id") id: string, @Req() req: Request) {
    await this.findOr404("style", id);
    const [series, blocks, roles] = await Promise.all([
      this.prisma.classSeries.count({ where: { styleId: id } }),
      this.prisma.scheduleBlock.count({ where: { styleId: id } }),
      this.prisma.personStyleRole.count({ where: { styleId: id } }),
    ]);
    if (series + blocks + roles > 0) {
      throw new ConflictException(
        "el estilo está en uso (series, horarios o perfiles) — no se puede borrar",
      );
    }
    await this.prisma.style.delete({ where: { id } });
    await this.audit(req, "STYLE_DELETE", "Style", id, {});
    return { ok: true };
  }

  // ─── Niveles de clase ────────────────────────────────────────────────

  @Get("class-levels")
  levels() {
    return this.prisma.classLevel.findMany({ orderBy: { order: "asc" } });
  }

  @Post("class-levels")
  async createLevel(@Body() dto: LevelDto, @Req() req: Request) {
    const level = await this.prisma.classLevel.create({ data: dto });
    await this.audit(req, "CLASS_LEVEL_CREATE", "ClassLevel", level.id, dto);
    return level;
  }

  @Patch("class-levels/:id")
  async updateLevel(
    @Param("id") id: string,
    @Body() dto: LevelDto,
    @Req() req: Request,
  ) {
    await this.findOr404("classLevel", id);
    const level = await this.prisma.classLevel.update({
      where: { id },
      data: dto,
    });
    await this.audit(req, "CLASS_LEVEL_UPDATE", "ClassLevel", id, dto);
    return level;
  }

  @Delete("class-levels/:id")
  @HttpCode(200)
  async deleteLevel(@Param("id") id: string, @Req() req: Request) {
    await this.findOr404("classLevel", id);
    const used = await this.prisma.classSeries.count({
      where: { levelId: id },
    });
    if (used > 0) {
      throw new ConflictException("el nivel está en uso por series activas");
    }
    await this.prisma.classLevel.delete({ where: { id } });
    await this.audit(req, "CLASS_LEVEL_DELETE", "ClassLevel", id, {});
    return { ok: true };
  }

  // ─── Tipos de clase ──────────────────────────────────────────────────

  @Get("class-types")
  types() {
    return this.prisma.classType.findMany({ orderBy: { name: "asc" } });
  }

  @Post("class-types")
  async createType(@Body() dto: TypeDto, @Req() req: Request) {
    const type = await this.prisma.classType.create({ data: dto });
    await this.audit(req, "CLASS_TYPE_CREATE", "ClassType", type.id, dto);
    return type;
  }

  @Patch("class-types/:id")
  async updateType(
    @Param("id") id: string,
    @Body() dto: TypeDto,
    @Req() req: Request,
  ) {
    await this.findOr404("classType", id);
    const type = await this.prisma.classType.update({
      where: { id },
      data: dto,
    });
    await this.audit(req, "CLASS_TYPE_UPDATE", "ClassType", id, dto);
    return type;
  }

  @Delete("class-types/:id")
  @HttpCode(200)
  async deleteType(@Param("id") id: string, @Req() req: Request) {
    await this.findOr404("classType", id);
    const used = await this.prisma.classSeriesType.count({
      where: { typeId: id },
    });
    if (used > 0) {
      throw new ConflictException("el tipo está en uso por series activas");
    }
    await this.prisma.classType.delete({ where: { id } });
    await this.audit(req, "CLASS_TYPE_DELETE", "ClassType", id, {});
    return { ok: true };
  }

  // ─── helpers ───

  private async findOr404(
    model: "style" | "classLevel" | "classType",
    id: string,
  ) {
    const found =
      model === "style"
        ? await this.prisma.style.findUnique({ where: { id } })
        : model === "classLevel"
          ? await this.prisma.classLevel.findUnique({ where: { id } })
          : await this.prisma.classType.findUnique({ where: { id } });
    if (!found) throw new NotFoundException("elemento no encontrado");
    return found;
  }

  private audit(
    req: Request,
    action: string,
    targetType: string,
    targetId: string,
    payload: unknown,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action,
        targetType,
        targetId,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }
}
