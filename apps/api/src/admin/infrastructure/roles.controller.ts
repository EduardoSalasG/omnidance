import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsString, Matches } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

class RequestRoleDto {
  @IsString()
  @Matches(/^[A-Z0-9_]+$/, { message: "rol inválido" })
  role!: string;
}

/**
 * Sandbox onboarding: cualquier usuario puede pedir un rol; nace en SANDBOX
 * (auto-aprobado para demo) hasta que el admin lo promueve. El catálogo de
 * roles requestable vive en DB (Role.requestable) — ADMIN nunca se
 * auto-otorga porque no es requestable.
 */
@Controller("roles")
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Catálogo público de roles solicitables (para /perfil). */
  @Get("catalog")
  catalog() {
    return this.prisma.role.findMany({
      where: { requestable: true },
      select: { key: true, label: true, description: true },
      orderBy: { key: "asc" },
    });
  }

  @Post("request")
  @UseGuards(SessionGuard)
  async request(@Body() dto: RequestRoleDto, @Req() req: Request) {
    const role = await this.prisma.role.findUnique({
      where: { key: dto.role },
      select: { key: true, requestable: true },
    });
    if (!role || !role.requestable) {
      throw new BadRequestException(
        `el rol ${dto.role} no se puede auto-solicitar`,
      );
    }
    const personId = req.person!.id;
    const existing = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId, role: dto.role } },
    });
    if (existing) {
      throw new ConflictException({
        error: "ROLE_ALREADY_EXISTS",
        message: `ya tienes el rol ${dto.role} (status ${existing.status})`,
        personRole: existing,
      });
    }
    return this.prisma.personRole.create({
      data: { personId, role: dto.role, status: "SANDBOX" },
    });
  }
}
