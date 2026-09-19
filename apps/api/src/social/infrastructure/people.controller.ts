import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";

/**
 * Búsqueda de personas y perfil público — la base social para agregar
 * amigos. Privacidad: solo nombre, foto, estilos/rol autodeclarados y
 * estado de amistad; nunca email/teléfono. Respeta UserBlock en ambas
 * direcciones (bloqueados no se ven ni encuentran).
 */
@Controller("people")
@UseGuards(SessionGuard)
export class PeopleController {
  constructor(private readonly prisma: PrismaService) {}

  /** IDs bloqueados en cualquier dirección respecto a `me`. */
  private async blockedIds(me: string): Promise<string[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: me }, { blockedId: me }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === me ? r.blockedId : r.blockerId));
  }

  /** Estado de amistad entre `me` y cada id: none | sent | received | friends. */
  private async friendshipMap(me: string, ids: string[]) {
    if (ids.length === 0) return new Map<string, { status: string; id: string }>();
    const rows = await this.prisma.friendship.findMany({
      where: {
        OR: [
          { aId: me, bId: { in: ids } },
          { bId: me, aId: { in: ids } },
        ],
      },
      select: { id: true, aId: true, bId: true, status: true },
    });
    const map = new Map<string, { status: string; id: string }>();
    for (const f of rows) {
      const other = f.aId === me ? f.bId : f.aId;
      map.set(other, {
        id: f.id,
        status:
          f.status === "ACCEPTED"
            ? "friends"
            : f.aId === me
              ? "sent"
              : "received",
      });
    }
    return map;
  }

  /**
   * GET /people/search?q= — busca por nombre (mín 2 chars). Excluye al
   * propio usuario y a bloqueados en ambas direcciones.
   */
  @Get("search")
  async search(@Req() req: Request, @Query("q") q = "") {
    const me = req.person!.id;
    const term = q.trim();
    if (term.length < 2) return [];

    const blocked = await this.blockedIds(me);
    const people = await this.prisma.person.findMany({
      where: {
        id: { notIn: [me, ...blocked] },
        name: { contains: term, mode: "insensitive" },
      },
      select: { id: true, name: true, photoUrl: true },
      orderBy: { name: "asc" },
      take: 20,
    });
    const fmap = await this.friendshipMap(me, people.map((p) => p.id));
    return people.map((p) => ({
      ...p,
      friendship: fmap.get(p.id) ?? { id: null, status: "none" },
    }));
  }

  /**
   * GET /people/:id — perfil público: nombre, foto, estilos/rol/nivel
   * autodeclarados, conteo de insignias y estado de amistad conmigo.
   */
  @Get(":id")
  async profile(@Param("id") id: string, @Req() req: Request) {
    const me = req.person!.id;
    const blocked = await this.blockedIds(me);
    if (blocked.includes(id)) {
      throw new NotFoundException("persona no encontrada");
    }

    const person = await this.prisma.person.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        photoUrl: true,
        styleRoles: {
          select: {
            role: true,
            level: true,
            style: { select: { id: true, name: true, genre: true } },
          },
        },
      },
    });
    if (!person) throw new NotFoundException("persona no encontrada");

    const [badges, fmap] = await Promise.all([
      this.prisma.personBadge.count({ where: { personId: id } }),
      this.friendshipMap(me, [id]),
    ]);

    return {
      id: person.id,
      name: person.name,
      photoUrl: person.photoUrl,
      styleRoles: person.styleRoles,
      badgeCount: badges,
      friendship: fmap.get(id) ?? { id: null, status: "none" },
      isMe: me === id,
    };
  }
}
