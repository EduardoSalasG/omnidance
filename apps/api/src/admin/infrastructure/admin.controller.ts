import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { AdminGuard } from "./admin.guard";

/**
 * Consola admin B2B — aprobación de roles (spec: sandbox onboarding,
 * los roles nacen PENDING/SANDBOX y el admin los promueve a APPROVED).
 */
@Controller("admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

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
  async approve(@Param("personRoleId") personRoleId: string) {
    const role = await this.prisma.personRole.findUnique({
      where: { id: personRoleId },
    });
    if (!role) throw new NotFoundException("solicitud de rol no encontrada");
    return this.prisma.personRole.update({
      where: { id: personRoleId },
      data: { status: "APPROVED" },
    });
  }

  /**
   * Rechazo: el enum RoleStatus no tiene REJECTED (gap de schema) —
   * decisión: se borra el PersonRole y se devuelve el registro eliminado.
   */
  @Post("role-requests/:personRoleId/reject")
  @HttpCode(200)
  async reject(@Param("personRoleId") personRoleId: string) {
    const role = await this.prisma.personRole.findUnique({
      where: { id: personRoleId },
    });
    if (!role) throw new NotFoundException("solicitud de rol no encontrada");
    await this.prisma.personRole.delete({ where: { id: personRoleId } });
    return role;
  }
}
