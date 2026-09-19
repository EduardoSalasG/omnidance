import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { RolesGuard } from "../../common/rbac/roles.guard";
import { RequireRoles } from "../../common/rbac/roles.decorator";
import { PrismaService } from "../../prisma.service";

/**
 * Consola de soporte: búsqueda y ficha read-only de usuarios para
 * atención de casos. RequireRoles solo deja pasar PersonRole APPROVED
 * (el guard filtra PENDING/SANDBOX/REJECTED por defecto) o ADMIN.
 * Sin mutaciones — las acciones correctivas siguen en /admin (auditadas).
 */
@Controller("support")
@UseGuards(SessionGuard, RolesGuard)
@RequireRoles("SUPPORT", "ADMIN")
export class SupportController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/support/users?q= — búsqueda por nombre/email, top 20. */
  @Get("users")
  search(@Query("q") q?: string) {
    const term = q?.trim() ?? "";
    if (term.length < 2) {
      // Umbral mínimo: sin él la consola expone un listado masivo de personas.
      throw new BadRequestException("la búsqueda requiere al menos 2 caracteres");
    }
    return this.prisma.person.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        roles: {
          select: { role: true, status: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /** GET /api/support/users/:id — ficha read-only para atender el caso. */
  @Get("users/:id")
  async detail(@Param("id") personId: string) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    if (!person) throw new NotFoundException("usuario no encontrado");

    const [roles, tickets, payments, checkinsCount, friendsCount] =
      await Promise.all([
        this.prisma.personRole.findMany({
          where: { personId },
          orderBy: { createdAt: "asc" },
          select: { role: true, status: true, createdAt: true },
        }),
        this.prisma.ticket.findMany({
          where: { ownerId: personId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, status: true, eventId: true, createdAt: true },
        }),
        this.prisma.payment.findMany({
          where: { personId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, status: true, amount: true, createdAt: true },
        }),
        // check-ins reales: los anulados (voidedAt) no son asistencia
        this.prisma.checkin.count({
          where: { personId, voidedAt: null },
        }),
        this.prisma.friendship.count({
          where: {
            status: "ACCEPTED",
            OR: [{ aId: personId }, { bId: personId }],
          },
        }),
      ]);

    return { person, roles, tickets, payments, checkinsCount, friendsCount };
  }
}
