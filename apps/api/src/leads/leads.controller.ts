import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { NotificationsService } from "../notifications/domain/notifications.service";

// Roles que un lead puede declarar en el formulario de /pro.
const ALLOWED_ROLES = new Set([
  "PRODUCER",
  "DJ",
  "ACADEMY_OWNER",
  "VENUE_MANAGER",
]);
const ALLOWED_INTENTS = new Set(["CONTACT", "DEMO"]);

type LeadBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  roles?: unknown;
  intent?: unknown;
};

/**
 * Formulario público de la landing /pro — sin sesión. Captura el lead y
 * avisa a los ADMIN (best-effort) para seguimiento comercial.
 */
@Controller("leads")
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post()
  async create(@Body() body: LeadBody) {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone =
      typeof body?.phone === "string" && body.phone.trim()
        ? body.phone.trim()
        : null;
    const roles = Array.isArray(body?.roles)
      ? body.roles.filter(
          (r): r is string =>
            typeof r === "string" && ALLOWED_ROLES.has(r),
        )
      : [];
    const intent =
      typeof body?.intent === "string" ? body.intent.toUpperCase() : "";

    if (name.length < 2) throw new BadRequestException("name requerido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException("email inválido");
    }
    if (roles.length === 0) {
      throw new BadRequestException("roles: elige al menos uno");
    }
    if (!ALLOWED_INTENTS.has(intent)) {
      throw new BadRequestException("intent inválido");
    }

    const lead = await this.prisma.lead.create({
      data: { name, email, phone, roles, intent },
    });

    // Aviso a admins aprobados — best-effort, nunca rompe el submit.
    const admins = await this.prisma.personRole.findMany({
      where: { role: "ADMIN", status: "APPROVED" },
      select: { personId: true },
    });
    for (const admin of admins) {
      await this.notifications.notifySafe(admin.personId, {
        category: "OPERATIONAL",
        type: "lead.new",
        title: `Nuevo lead: ${name}`,
        body: `${email} · ${roles.join(", ")} · ${intent === "DEMO" ? "pide demo" : "quiere contacto"}`,
        data: { leadId: lead.id },
      });
    }

    return { ok: true };
  }
}
