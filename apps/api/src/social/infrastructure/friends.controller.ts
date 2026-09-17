import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { NotificationsService } from "../../notifications/domain/notifications.service";

class FriendRequestDto {
  @IsString()
  personId!: string;
}

/**
 * Amistades entre bailarines (spec-gap-closure: social/friendships —
 * omni-dance.md §8). aId = solicitante, bId = destinatario: solo bId decide
 * (accept); ambos pueden borrar (decline/unfriend → delete). La unicidad del
 * par se garantiza en código rechazando filas en cualquier dirección.
 * Friendship no tiene @relation a Person → joins manuales.
 */
@Controller("friends")
@UseGuards(SessionGuard)
export class FriendsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Enviar solicitud → PENDING + notifica al destinatario.
   * Duplicada en cualquier dirección (pendiente o aceptada) → 409.
   */
  @Post()
  async request(@Req() req: Request, @Body() dto: FriendRequestDto) {
    const aId = req.person!.id;
    if (dto.personId === aId) {
      throw new BadRequestException("no puedes agregarte a ti mismo");
    }

    const target = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("persona no encontrada");

    const existing = await this.prisma.friendship.findFirst({
      where: {
        OR: [
          { aId, bId: dto.personId },
          { aId: dto.personId, bId: aId },
        ],
      },
    });
    if (existing) {
      throw new ConflictException("ya existe una solicitud o amistad con esta persona");
    }

    const friendship = await this.prisma.friendship.create({
      data: { aId, bId: dto.personId },
    });

    const requester = await this.prisma.person.findUnique({
      where: { id: aId },
      select: { name: true },
    });
    await this.notifications.notifySafe(dto.personId, {
      category: "SOCIAL",
      type: "friend.request",
      title: `${requester?.name ?? "Alguien"} te envió una solicitud de amistad`,
      data: { friendshipId: friendship.id },
    });

    return friendship;
  }

  /** Aceptar — solo el destinatario (bId); el solicitante → 403. */
  @Post(":id/accept")
  @HttpCode(200)
  async accept(@Req() req: Request, @Param("id") id: string) {
    const friendship = await this.findOr404(id);
    if (friendship.bId !== req.person!.id) {
      throw new ForbiddenException("solo el destinatario puede aceptar la solicitud");
    }
    return this.prisma.friendship.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });
  }

  /** Rechazar — elimina la solicitud; cualquiera de los dos participantes. */
  @Post(":id/decline")
  @HttpCode(200)
  async decline(@Req() req: Request, @Param("id") id: string) {
    return this.remove(id, req.person!.id);
  }

  /** Eliminar amistad/solicitud — cualquiera de los dos participantes. */
  @Delete(":id")
  @HttpCode(200)
  async unfriend(@Req() req: Request, @Param("id") id: string) {
    return this.remove(id, req.person!.id);
  }

  /**
   * {friends, pendingReceived, pendingSent} — amigos ACCEPTED en ambas
   * direcciones + solicitudes pendientes recibidas (bId=me) y enviadas
   * (aId=me). Cada item: {id, createdAt, status, person:{id,name,photoUrl}}.
   */
  @Get()
  async mine(@Req() req: Request) {
    const me = req.person!.id;
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ aId: me }, { bId: me }] },
      orderBy: { createdAt: "desc" },
    });

    const counterpartIds = [
      ...new Set(rows.map((f) => (f.aId === me ? f.bId : f.aId))),
    ];
    const people = await this.prisma.person.findMany({
      where: { id: { in: counterpartIds } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));

    const item = (f: (typeof rows)[number]) => ({
      id: f.id,
      status: f.status,
      createdAt: f.createdAt,
      person: byId.get(f.aId === me ? f.bId : f.aId) ?? null,
    });

    return {
      friends: rows.filter((f) => f.status === "ACCEPTED").map(item),
      pendingReceived: rows
        .filter((f) => f.status === "PENDING" && f.bId === me)
        .map(item),
      pendingSent: rows
        .filter((f) => f.status === "PENDING" && f.aId === me)
        .map(item),
    };
  }

  // ─── helpers ───

  private async findOr404(id: string) {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id },
    });
    if (!friendship) throw new NotFoundException("solicitud no encontrada");
    return friendship;
  }

  private async remove(id: string, actorId: string) {
    const friendship = await this.findOr404(id);
    if (friendship.aId !== actorId && friendship.bId !== actorId) {
      throw new ForbiddenException("no eres parte de esta amistad");
    }
    return this.prisma.friendship.delete({ where: { id } });
  }
}
