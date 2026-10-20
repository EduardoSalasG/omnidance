import {
  BadRequestException,
  ConflictException,
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
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import type { Request } from "express";
import type { Prisma, RoleStatus } from "@prisma/client";
import { Inject } from "@nestjs/common";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { AuthService } from "../../auth/domain/auth.service";
import { MAILER, type Mailer } from "../../auth/domain/ports";
import { inviteEmailHtml } from "../../auth/infrastructure/emails";
import { NotificationsService } from "../../notifications/domain/notifications.service";
import { PrismaService } from "../../prisma.service";
import {
  invalidateRoleCatalog,
  RolesGuard,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";
import { pageParams } from "../../academies/infrastructure/list-filters";
import { evaluateAcademyChecks } from "../../academies/infrastructure/academy-review";
import { roleProfileChecks } from "../../common/role-checks";
import { dateRange } from "../../query/entities/helpers";
import { ApiPropertyOptional } from "@nestjs/swagger";

const ALL_STATUSES: RoleStatus[] = ["PENDING", "APPROVED", "REJECTED"];

// Roles de actor registrables por landing: PENDING opera la consola
// pero solo pasa a APPROVED (visible) tras validación de perfil.
const VALIDATION_QUEUE_ROLES = ["ACADEMY_OWNER", "PRODUCER"] as const;
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
  @ApiPropertyOptional()
  q?: string;

  // Filtro por rol (mismo param/semántica que la entidad `people` del
  // catálogo de consultas - spec analytics/query-console).
  @IsOptional()
  @IsString()
  @Matches(ROLE_KEY, { message: "rol inválido" })
  @ApiPropertyOptional()
  role?: string;

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
 * GET /admin/audit - mismos params que la convención del query engine:
 * q = texto libre sobre action/targetType/targetId; type = contains
 * sobre action; actor = actorId exacto; from/to = rango ISO sobre
 * createdAt (mal formadas → 400 por @IsISO8601).
 */
class AuditQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  limit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  q?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @ApiPropertyOptional()
  actor?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  from?: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  to?: string;
}

/**
 * Consola admin B2B - asignación directa de roles, gestión de usuarios,
 * catálogo RBAC (roles/permisos/grants) y auditoría. Todo se resuelve en
 * DB: permiso admin.access vía RolePermission (o Role.isSuperuser).
 */
@Controller("admin")
@UseGuards(SessionGuard, RolesGuard)
@RequirePermissions("admin.access")
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Usuarios ──────────────────────────────────────────────────────────

  /**
   * Buscador de personas paginado - nunca lista masiva: sin `q` de ≥2
   * chars ni filtro `role` responde envelope vacío. Busca por nombre,
   * email o teléfono; `role` (key del catálogo RBAC, existe o 400) lista
   * sus titulares - misma regla que la entidad `people` del query
   * engine. Responde `{items,total,page,pageSize}` (pageParams: page≥1,
   * size default 25 cap 100).
   */
  @Get("users")
  async users(@Query() q: UsersQueryDto) {
    const term = q.q?.trim() ?? "";
    const role = q.role;
    const pg = pageParams(q.page, q.pageSize);
    const empty = { items: [], total: 0, page: pg.page, pageSize: pg.pageSize };
    if (role) {
      const exists = await this.prisma.role.findUnique({
        where: { key: role },
        select: { key: true },
      });
      if (!exists) {
        throw new BadRequestException(
          `rol ${role} no existe en el catálogo`,
        );
      }
    }
    if (!role && term.length < 2) return empty;
    const where: Prisma.PersonWhereInput = {
      ...(term.length >= 2
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" as const } },
              { email: { contains: term, mode: "insensitive" as const } },
              { phone: { contains: term, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(role ? { roles: { some: { role } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.person.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pg.skip,
        take: pg.take,
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
      }),
      this.prisma.person.count({ where }),
    ]);
    // Peso del actor: academias propias (ownerId) y eventos creados
    // (producerId) - groupBy sobre los ids de la página, sin N+1.
    const ids = items.map((p) => p.id);
    const [academyGroups, eventGroups] = ids.length
      ? await Promise.all([
          this.prisma.academy.groupBy({
            by: ["ownerId"],
            where: { ownerId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.event.groupBy({
            by: ["producerId"],
            where: { producerId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const acadByOwner = new Map(
      academyGroups.map((g) => [g.ownerId, g._count._all]),
    );
    const evByProducer = new Map(
      eventGroups.map((g) => [g.producerId, g._count._all]),
    );
    return {
      items: items.map((p) => ({
        ...p,
        academiesCount: acadByOwner.get(p.id) ?? 0,
        eventsCount: evByProducer.get(p.id) ?? 0,
      })),
      total,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }

  /**
   * Otorga un rol o cambia su estado (PENDING → APPROVED y
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

  /**
   * Cola de validación (spec role-registration-pipeline): PersonRole
   * PENDING de ACADEMY_OWNER/PRODUCER - actores registrados por landing
   * que ya operan su consola pero son invisibles al público. El admin
   * aprueba solo si el perfil está completo (checklist server-side).
   */
  @Get("validation-queue")
  async validationQueue() {
    const rows = await this.prisma.personRole.findMany({
      where: { role: { in: [...VALIDATION_QUEUE_ROLES] }, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        createdAt: true,
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            verifiedAt: true,
            createdAt: true,
          },
        },
      },
    });
    const ids = rows.map((r) => r.person.id);
    // "Datos del actor" del checklist: owner → tiene ≥1 academia;
    // productor → tiene ≥1 evento creado. groupBy, sin N+1.
    const [academyGroups, eventGroups] = ids.length
      ? await Promise.all([
          this.prisma.academy.groupBy({
            by: ["ownerId"],
            where: { ownerId: { in: ids } },
            _count: { _all: true },
          }),
          this.prisma.event.groupBy({
            by: ["producerId"],
            where: { producerId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const acadByOwner = new Map(
      academyGroups.map((g) => [g.ownerId, g._count._all]),
    );
    const evByProducer = new Map(
      eventGroups.map((g) => [g.producerId, g._count._all]),
    );
    return rows.map((r) => {
      const checks = roleProfileChecks(
        r.person,
        r.role,
        acadByOwner.get(r.person.id) ?? 0,
        evByProducer.get(r.person.id) ?? 0,
      );
      return {
        id: r.id,
        role: r.role,
        requestedAt: r.createdAt,
        person: r.person,
        checks,
        complete: Object.values(checks).every(Boolean),
      };
    });
  }

  /** Aprueba la solicitud: PENDING → APPROVED (visible al público). */
  @Post("validation-queue/:personRoleId/approve")
  @HttpCode(200)
  async approveQueueItem(
    @Param("personRoleId") id: string,
    @Req() req: Request,
  ) {
    const row = await this.prisma.personRole.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            verifiedAt: true,
          },
        },
      },
    });
    if (!row || row.status !== "PENDING") {
      throw new NotFoundException("solicitud no encontrada");
    }
    const [academies, events] = await Promise.all([
      this.prisma.academy.count({ where: { ownerId: row.person.id } }),
      this.prisma.event.count({ where: { producerId: row.person.id } }),
    ]);
    const checks = roleProfileChecks(row.person, row.role, academies, events);
    if (!Object.values(checks).every(Boolean)) {
      throw new ConflictException(
        "perfil incompleto - faltan datos antes de aprobar",
      );
    }
    await this.prisma.personRole.update({
      where: { id },
      data: { status: "APPROVED" },
    });
    // Aviso al actor: su rol quedó aprobado (spec rbac) - la card de
    // pendiente desaparece y el rol pasa a visible al público.
    await this.notifications.notifySafe(row.person.id, {
      category: "OPERATIONAL",
      type: "role.approved",
      title: "Tu rol fue aprobado",
      body:
        row.role === "ACADEMY_OWNER"
          ? "Tu academia ya puede publicarse y aparecer en Explorar"
          : "Tus eventos ya son visibles en la cartelera",
      data: { role: row.role, path: "/inicio" },
    });
    await this.audit(req, "ROLE_APPROVE", "PersonRole", id, {
      personId: row.person.id,
      role: row.role,
    });
    return { ok: true };
  }

  /** Rechaza la solicitud: PENDING → REJECTED (auditable, no borra). */
  @Post("validation-queue/:personRoleId/reject")
  @HttpCode(200)
  async rejectQueueItem(
    @Param("personRoleId") id: string,
    @Req() req: Request,
  ) {
    const row = await this.prisma.personRole.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, personId: true },
    });
    if (!row || row.status !== "PENDING") {
      throw new NotFoundException("solicitud no encontrada");
    }
    await this.prisma.personRole.update({
      where: { id },
      data: { status: "REJECTED" },
    });
    await this.notifications.notifySafe(row.personId, {
      category: "OPERATIONAL",
      type: "role.rejected",
      title: "Tu solicitud de rol fue rechazada",
      body: "Si crees que es un error, contáctanos por soporte",
      data: { role: row.role, path: "/soporte" },
    });
    await this.audit(req, "ROLE_REJECT", "PersonRole", id, {
      personId: row.personId,
      role: row.role,
    });
    return { ok: true };
  }

  /**
   * Cola de academias (spec academy-approval-gate): PENDING/REJECTED con
   * el checklist ya evaluado server-side — el admin ve de un vistazo
   * qué falta; la mayoría se auto-aprueba sola al completar datos.
   */
  @Get("academy-review-queue")
  async academyReviewQueue() {
    const academies = await this.prisma.academy.findMany({
      where: { reviewStatus: { in: ["PENDING", "REJECTED"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        reviewStatus: true,
        createdAt: true,
        ownerId: true,
      },
    });
    const checks = await evaluateAcademyChecks(
      this.prisma,
      academies.map((a) => a.id),
    );
    const owners = await this.prisma.person.findMany({
      where: { id: { in: [...new Set(academies.map((a) => a.ownerId))] } },
      select: {
        id: true,
        name: true,
        email: true,
        roles: {
          where: { role: "ACADEMY_OWNER" },
          select: { status: true },
        },
      },
    });
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    return academies.map((a) => {
      const c = checks.get(a.id);
      return {
        id: a.id,
        name: a.name,
        reviewStatus: a.reviewStatus,
        createdAt: a.createdAt,
        owner: ownerById.get(a.ownerId) ?? null,
        checks: c ?? null,
        complete: c ? Object.values(c).every(Boolean) : false,
      };
    });
  }

  /** Override: fuerza APPROVED aunque el checklist esté incompleto. */
  @Post("academy-review-queue/:academyId/approve")
  @HttpCode(200)
  async approveAcademy(@Param("academyId") id: string, @Req() req: Request) {
    const row = await this.prisma.academy.findUnique({
      where: { id },
      select: { id: true, name: true, reviewStatus: true, ownerId: true },
    });
    if (!row) throw new NotFoundException("academia no encontrada");
    if (row.reviewStatus === "APPROVED") return { ok: true };
    await this.prisma.academy.update({
      where: { id },
      data: { reviewStatus: "APPROVED" },
    });
    await this.audit(req, "ACADEMY_APPROVE", "Academy", id, {
      prev: row.reviewStatus,
      ownerId: row.ownerId,
    });
    return { ok: true };
  }

  /** Rechaza: REJECTED la oculta aunque el checklist esté completo. */
  @Post("academy-review-queue/:academyId/reject")
  @HttpCode(200)
  async rejectAcademy(@Param("academyId") id: string, @Req() req: Request) {
    const row = await this.prisma.academy.findUnique({
      where: { id },
      select: { id: true, reviewStatus: true, ownerId: true },
    });
    if (!row) throw new NotFoundException("academia no encontrada");
    if (row.reviewStatus === "REJECTED") return { ok: true };
    await this.prisma.academy.update({
      where: { id },
      data: { reviewStatus: "REJECTED" },
    });
    await this.audit(req, "ACADEMY_REJECT", "Academy", id, {
      prev: row.reviewStatus,
      ownerId: row.ownerId,
    });
    return { ok: true };
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

  /**
   * Borra la persona en cascada (hard delete). Pensado para cuentas de
   * prueba/duplicadas: elimina primero las filas con FK declarada a
   * Person (roles, estilos, RSVPs, gigs DJ, notificaciones, push
   * tokens, perfil fiscal, suscripciones de plataforma) y luego la
   * Person. El resto del dominio referencia por id sin FK
   * (Ticket.ownerId, AuditLog.actorId, sesiones, prácticas…) - quedan
   * como huella histórica, igual que una baja de negocio.
   * No permite borrar la propia cuenta del admin en sesión.
   */
  @Delete("users/:personId")
  async deleteUser(
    @Param("personId") personId: string,
    @Req() req: Request,
  ) {
    if (personId === req.person!.id) {
      throw new BadRequestException(
        "no puedes eliminar tu propia cuenta",
      );
    }
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, email: true, name: true },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");

    await this.prisma.$transaction([
      this.prisma.platformSubscription.updateMany({
        where: { producerId: personId },
        data: { producerId: null },
      }),
      this.prisma.platformSubscription.deleteMany({
        where: { personId },
      }),
      this.prisma.personRole.deleteMany({ where: { personId } }),
      this.prisma.fiscalProfile.deleteMany({ where: { personId } }),
      this.prisma.personStyleRole.deleteMany({ where: { personId } }),
      this.prisma.rsvp.deleteMany({ where: { personId } }),
      this.prisma.eventDj.deleteMany({ where: { personId } }),
      this.prisma.notification.deleteMany({ where: { personId } }),
      this.prisma.pushToken.deleteMany({ where: { personId } }),
      this.prisma.paymentClaim.deleteMany({ where: { personId } }),
      this.prisma.person.delete({ where: { id: personId } }),
    ]);
    await this.audit(req, "USER_DELETE", "Person", personId, {
      email: person.email,
      name: person.name,
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

  // ── Leads (/pro) ──────────────────────────────────────────────────────

  /**
   * Convierte un lead en usuario: crea la Person si no existe (o usa la
   * cuenta demo ligada), la deja con pendingProfileAt + isDemoAccount
   * (solo lectura hasta completar), le envía magic link por email +
   * notificación in-app pidiendo completar sus datos. El cierre ocurre
   * en POST /me/complete-profile → isDemoAccount off + lead CONVERTED.
   * Si el email ya es una cuenta real → enlaza y CONVERTED directo.
   */
  @Post("leads/:id/convert")
  @HttpCode(200)
  async convertLead(@Param("id") id: string, @Req() req: Request) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("lead no encontrado");

    let person = lead.personId
      ? await this.prisma.person.findUnique({ where: { id: lead.personId } })
      : await this.prisma.person.findUnique({ where: { email: lead.email } });

    // Email ya registrado como cuenta real - el lead se resuelve solo.
    if (person && !person.isDemoAccount) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { personId: person.id, status: "CONVERTED" },
      });
      await this.audit(req, "LEAD_CONVERT", "Lead", lead.id, {
        alreadyReal: true,
        personId: person.id,
      });
      return { ok: true, alreadyReal: true };
    }

    if (!person) {
      // Solo roles que existen en el catálogo - mismo criterio que el
      // acceso demo.
      const known = await this.prisma.role.findMany({
        where: { key: { in: lead.roles } },
        select: { key: true },
      });
      // Person.phone es unique - si el teléfono del lead ya pertenece a
      // otra cuenta, el create explotaría en 500. 409 para que el admin
      // resuelva el choque manualmente (no auto-fusionamos identidades).
      // (lead.phone puede ser null en intent DEMO.)
      if (lead.phone) {
        const phoneTaken = await this.prisma.person.findUnique({
          where: { phone: lead.phone },
          select: { id: true },
        });
        if (phoneTaken) {
          throw new ConflictException("phone_exists");
        }
      }
      person = await this.prisma.person.create({
        data: {
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          isDemoAccount: true,
          pendingProfileAt: new Date(),
          roles: {
            create: known.map((r) => ({ role: r.key, status: "APPROVED" })),
          },
        },
      });
    } else {
      person = await this.prisma.person.update({
        where: { id: person.id },
        data: { pendingProfileAt: new Date() },
      });
    }

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        personId: person.id,
        status: lead.status === "CONVERTED" ? "CONVERTED" : "CONTACTED",
      },
    });

    // Invitación por email (magic link = verificación de correo) +
    // notificación in-app para cuando ya tenga la sesión demo activa.
    const token = await this.auth.createMagicToken(lead.email);
    const apiUrl = process.env.API_URL ?? "http://localhost:4000";
    const link = `${apiUrl}/api/auth/verify?token=${token}`;
    await this.mailer.send(
      lead.email,
      "Tu cuenta Omnidance está lista",
      inviteEmailHtml(lead.name, link),
    );
    await this.notifications.notifySafe(person.id, {
      category: "OPERATIONAL",
      type: "account.complete_profile",
      title: "Completa tu perfil",
      body: "Faltan datos para activar tu cuenta",
      data: { path: "/perfil/completar" },
    });

    await this.audit(req, "LEAD_CONVERT", "Lead", lead.id, {
      personId: person.id,
      roles: lead.roles,
    });
    return { ok: true, alreadyReal: false };
  }

  // ── Auditoría ─────────────────────────────────────────────────────────

  @Get("audit")
  auditLog(@Query() q: AuditQueryDto) {
    const take = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const term = q.q?.trim();
    const type = q.type?.trim();
    const range = dateRange(q.from, q.to);
    return this.prisma.auditLog.findMany({
      where: {
        ...(term
          ? {
              OR: [
                { action: { contains: term, mode: "insensitive" as const } },
                {
                  targetType: {
                    contains: term,
                    mode: "insensitive" as const,
                  },
                },
                {
                  targetId: { contains: term, mode: "insensitive" as const },
                },
              ],
            }
          : {}),
        ...(type
          ? { action: { contains: type, mode: "insensitive" as const } }
          : {}),
        ...(q.actor ? { actorId: q.actor } : {}),
        ...(range ? { createdAt: range } : {}),
      },
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
