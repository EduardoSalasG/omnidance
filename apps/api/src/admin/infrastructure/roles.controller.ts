import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn } from "class-validator";
import type { Request } from "express";
import type { UserRole } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

const REQUESTABLE_ROLES: UserRole[] = [
  "DANCER",
  "DJ",
  "PRODUCER",
  "STAFF",
  "VENUE_MANAGER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
  "SUPPORT",
  "ADMIN",
];

class RequestRoleDto {
  @IsIn(REQUESTABLE_ROLES)
  role!: UserRole;
}

/**
 * Sandbox onboarding: cualquier usuario puede pedir un rol; nace en SANDBOX
 * (auto-aprobado para demo) hasta que el admin lo promueve. ADMIN nunca se
 * auto-otorga → 400.
 */
@Controller("roles")
export class RolesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post("request")
  @UseGuards(SessionGuard)
  async request(@Body() dto: RequestRoleDto, @Req() req: Request) {
    if (dto.role === "ADMIN") {
      throw new BadRequestException("el rol ADMIN no se puede auto-solicitar");
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
