import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import type { Prisma, RoleStatus, UserRole } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequireRoles } from "../../common/rbac/roles.decorator";

const ALL_ROLES: UserRole[] = [
  "DANCER",
  "DJ",
  "PRODUCER",
  "STAFF",
  "VENUE_MANAGER",
  "ACADEMY_OWNER",
  "INSTRUCTOR",
  "ADMIN",
  "SUPPORT",
];

const ALL_STATUSES: RoleStatus[] = ["PENDING", "SANDBOX", "APPROVED"];

class SetRoleDto {
  @IsIn(ALL_ROLES)
  role!: UserRole;

  @IsIn(ALL_STATUSES)
  status!: RoleStatus;
}

class UsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

/**
 * Consola admin B2B — aprobación de roles, gestión de usuarios y auditoría.
 * RBAC global: solo ADMIN APPROVED (RolesGuard + RequireRoles).
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles("ADMIN")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Solicitudes de rol ────────────────────────────────────────────────

  @Get("role-requests")
  listRoleRequests() {
    return this.prisma.personRole.findMany({
      where: { status: { in: ["PENDING", "SANDBOX"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        personId: true,
        role: true,
        status: true,
        createdAt: true,
        person: { select: { id: true, name: true, email: true } },
      },
    });
  }

  @Post("role-requests/:personRoleId/approve")
  @HttpCode(200)
  async approve(
    @Param("personRoleId") personRoleId: string,
    @Req() req: Request,
  ) {
    const role = await this.prisma.personRole.findUnique({
      where: { id: personRoleId },
    });
    if (!role) throw new NotFoundException("solicitud de rol no encontrada");
    const updated = await this.prisma.personRole.update({
      where: { id: personRoleId },
      data: { status: "APPROVED" },
    });
    await this.audit(req, "ROLE_APPROVE", "PersonRole", personRoleId, {
      personId: role.personId,
      role: role.role,
      prev: role.status,
      next: "APPROVED",
    });
    return updated;
  }

  /**
   * Rechazo: el enum RoleStatus no tiene REJECTED (gap de schema) —
   * decisión: se borra el PersonRole y se devuelve el registro eliminado.
   */
  @Post("role-requests/:personRoleId/reject")
  @HttpCode(200)
  async reject(
    @Param("personRoleId") personRoleId: string,
    @Req() req: Request,
  ) {
    const role = await this.prisma.personRole.findUnique({
      where: { id: personRoleId },
    });
    if (!role) throw new NotFoundException("solicitud de rol no encontrada");
    await this.prisma.personRole.delete({ where: { id: personRoleId } });
    await this.audit(req, "ROLE_REJECT", "PersonRole", personRoleId, {
      personId: role.personId,
      role: role.role,
      prev: role.status,
    });
    return role;
  }

  // ── Usuarios ──────────────────────────────────────────────────────────

  @Get("users")
  async users(@Query() q: UsersQueryDto) {
    const where = q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" as const } },
            { email: { contains: q.q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const people = await this.prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        roles: {
          select: { id: true, role: true, status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return people;
  }

  /**
   * Otorga un rol o cambia su estado (PENDING → SANDBOX → APPROVED y
   * downgrade para suspender acceso sin borrar el historial).
   */
  @Post("users/:personId/roles")
  @HttpCode(200)
  async setRole(
    @Param("personId") personId: string,
    @Body() dto: SetRoleDto,
    @Req() req: Request,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");

    const prev = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId, role: dto.role } },
    });
    const row = await this.prisma.personRole.upsert({
      where: { personId_role: { personId, role: dto.role } },
      update: { status: dto.status },
      create: { personId, role: dto.role, status: dto.status },
    });
    await this.audit(req, "ROLE_SET", "PersonRole", row.id, {
      personId,
      role: dto.role,
      prev: prev?.status ?? null,
      next: dto.status,
    });
    return row;
  }

  /** Revoca un rol (borra el PersonRole; queda en AuditLog). */
  @Delete("users/:personId/roles/:role")
  async revokeRole(
    @Param("personId") personId: string,
    @Param("role") role: string,
    @Req() req: Request,
  ) {
    if (!ALL_ROLES.includes(role as UserRole)) {
      throw new BadRequestException("rol inválido");
    }
    const existing = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId, role: role as UserRole } },
    });
    if (!existing) throw new NotFoundException("el usuario no tiene ese rol");
    await this.prisma.personRole.delete({ where: { id: existing.id } });
    await this.audit(req, "ROLE_REVOKE", "PersonRole", existing.id, {
      personId,
      role,
      prev: existing.status,
    });
    return { ok: true };
  }

  // ── Auditoría ─────────────────────────────────────────────────────────

  @Get("audit")
  auditLog(@Query("limit") limit?: string) {
    const take = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  private audit(
    req: Request,
    action: string,
    targetType: string,
    targetId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditLog.create({
      data: {
        actorId: req.person!.id,
        action,
        targetType,
        targetId,
        payload,
      },
    });
  }
}
