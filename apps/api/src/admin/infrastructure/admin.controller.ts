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
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import type { Request } from "express";
import type { Prisma, RoleStatus } from "@prisma/client";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import {
  invalidateRoleCatalog,
  RolesGuard,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

const ALL_STATUSES: RoleStatus[] = [
  "PENDING",
  "SANDBOX",
  "APPROVED",
  "REJECTED",
];
const ROLE_KEY = /^[A-Z0-9_]+$/;
const PERM_KEY = /^[a-z0-9_.-]+$/;

class SetRoleDto {
  @IsString()
  @Matches(ROLE_KEY, { message: "rol inválido" })
  role!: string;

  @IsIn(ALL_STATUSES)
  status!: RoleStatus;
}

class CreateRoleDto {
  @IsString()
  @Matches(ROLE_KEY, { message: "key inválida (MAYÚSCULAS_Y_GUIONES)" })
  key!: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  requestable?: boolean;
}

class GrantPermissionDto {
  @IsString()
  @Matches(PERM_KEY, { message: "permiso inválido" })
  permission!: string;

  @IsBoolean()
  grant!: boolean;
}

class UsersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

/**
 * Consola admin B2B — asignación directa de roles, gestión de usuarios,
 * catálogo RBAC (roles/permisos/grants) y auditoría. Todo se resuelve en
 * DB: permiso admin.access vía RolePermission (o Role.isSuperuser).
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  // ── Usuarios ──────────────────────────────────────────────────────────

  /**
   * Buscador de personas — nunca lista masiva: sin `q` de ≥2 chars
   * responde []. Busca por nombre, email o teléfono.
   */
  @Get("users")
  async users(@Query() q: UsersQueryDto) {
    const term = q.q?.trim() ?? "";
    if (term.length < 2) return [];
    const people = await this.prisma.person.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { phone: { contains: term, mode: "insensitive" } },
        ],
      },
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
    const roleExists = await this.prisma.role.findUnique({
      where: { key: dto.role },
      select: { key: true },
    });
    if (!roleExists) {
      throw new BadRequestException(`rol ${dto.role} no existe en el catálogo`);
    }

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
    if (!ROLE_KEY.test(role)) {
      throw new BadRequestException("rol inválido");
    }
    const existing = await this.prisma.personRole.findUnique({
      where: { personId_role: { personId, role } },
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

  // ── Catálogo RBAC (roles, permisos, grants) ───────────────────────────

  @Get("roles")
  roles() {
    return this.prisma.role.findMany({
      orderBy: { key: "asc" },
      select: {
        key: true,
        label: true,
        description: true,
        requestable: true,
        isSuperuser: true,
        permissions: { select: { permissionKey: true } },
        _count: { select: { personRoles: true } },
      },
    });
  }

  /** Crea un rol custom en el catálogo (ej. un rol operativo nuevo). */
  @Post("roles")
  async createRole(@Body() dto: CreateRoleDto, @Req() req: Request) {
    const row = await this.prisma.role.upsert({
      where: { key: dto.key },
      update: {
        label: dto.label,
        description: dto.description,
        requestable: dto.requestable,
      },
      create: {
        key: dto.key,
        label: dto.label,
        description: dto.description,
        requestable: dto.requestable ?? false,
      },
    });
    invalidateRoleCatalog(dto.key);
    await this.audit(req, "ROLE_UPSERT", "Role", dto.key, {
      label: dto.label,
      requestable: dto.requestable ?? false,
    });
    return row;
  }

  @Get("permissions")
  permissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: "asc" },
      select: { key: true, description: true },
    });
  }

  /** Alta de un permiso nuevo (normalmente lo declara una ruta nueva). */
  @Post("permissions")
  async createPermission(
    @Body() dto: { key?: string; description?: string },
    @Req() req: Request,
  ) {
    if (!dto.key || !PERM_KEY.test(dto.key)) {
      throw new BadRequestException("key de permiso inválida");
    }
    const row = await this.prisma.permission.upsert({
      where: { key: dto.key },
      update: { description: dto.description },
      create: { key: dto.key, description: dto.description },
    });
    await this.audit(req, "PERMISSION_UPSERT", "Permission", dto.key, {
      description: dto.description ?? null,
    });
    return row;
  }

  /** Otorga o revoca un permiso a un rol (grant: true/false). */
  @Post("roles/:key/permissions")
  @HttpCode(200)
  async grantPermission(
    @Param("key") roleKey: string,
    @Body() dto: GrantPermissionDto,
    @Req() req: Request,
  ) {
    const [role, perm] = await Promise.all([
      this.prisma.role.findUnique({ where: { key: roleKey } }),
      this.prisma.permission.findUnique({ where: { key: dto.permission } }),
    ]);
    if (!role) throw new NotFoundException("rol no encontrado");
    if (!perm) throw new NotFoundException("permiso no encontrado");

    if (dto.grant) {
      await this.prisma.rolePermission.upsert({
        where: {
          roleKey_permissionKey: { roleKey, permissionKey: dto.permission },
        },
        update: {},
        create: { roleKey, permissionKey: dto.permission },
      });
    } else {
      await this.prisma.rolePermission.deleteMany({
        where: { roleKey, permissionKey: dto.permission },
      });
    }
    invalidateRoleCatalog(roleKey);
    await this.audit(req, "PERMISSION_GRANT", "Role", roleKey, {
      permission: dto.permission,
      grant: dto.grant,
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
