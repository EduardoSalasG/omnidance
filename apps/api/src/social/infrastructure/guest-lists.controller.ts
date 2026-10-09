import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import type { Request, Response } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { pageParams } from "../../academies/infrastructure/list-filters";
import {
  RolesGuard,
  roleKeysHavePermission,
} from "../../common/rbac/roles.guard";
import { RequirePermissions } from "../../common/rbac/roles.decorator";

class CreateGuestListDto {
  @IsString()
  ownerId!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  specialPrice?: number;
}

class AddEntryDto {
  @IsString()
  personId!: string;
}

/**
 * Filtros de `GET /events/:eventId/guest-lists` - contrato compartido de
 * la barra de filtros (spec analytics/query-console): `status` filtra las
 * entries (whitelist PENDING|ARRIVED → 400 inválido), `q` busca por nombre
 * del invitado, dueño de la lista o etiqueta. Opcionales/aditivos.
 */
class ListGuestListsDto {
  @IsOptional()
  @IsIn(["PENDING", "ARRIVED"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}

/** Listas de invitados por evento - solo productor/staff/admin. */
@Controller("events")
export class EventGuestListsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(":eventId/guest-lists")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("social.manage")
  async create(
    @Param("eventId") eventId: string,
    @Body() dto: CreateGuestListDto,
  ) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const owner = await this.prisma.person.findUnique({
      where: { id: dto.ownerId },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException("owner no encontrado");

    return this.prisma.guestList.create({
      data: {
        eventId,
        ownerId: dto.ownerId,
        label: dto.label ?? null,
        specialPrice: dto.specialPrice ?? null,
      },
      include: { entries: true },
    });
  }

  @Get(":eventId/guest-lists")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("social.manage")
  async list(@Param("eventId") eventId: string, @Query() dto: ListGuestListsDto) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException("evento no encontrado");

    const lists = await this.prisma.guestList.findMany({
      where: { eventId },
      include: {
        entries: {
          where: dto.status ? { status: dto.status } : {},
        },
      },
    });

    // GuestList.ownerId / GuestListEntry.personId son escalares → join manual
    const personIds = [
      ...new Set([
        ...lists.map((l) => l.ownerId),
        ...lists.flatMap((l) => l.entries.map((e) => e.personId)),
      ]),
    ];
    const people = await this.prisma.person.findMany({
      where: { id: { in: personIds } },
      select: { id: true, name: true, photoUrl: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const brief = (id: string) => {
      const p = byId.get(id);
      return { personId: id, name: p?.name ?? "?", photoUrl: p?.photoUrl ?? null };
    };

    const mapped = lists.map((l) => ({
      ...l,
      owner: brief(l.ownerId),
      entries: l.entries.map((e) => ({ ...e, person: brief(e.personId) })),
    }));

    // q: una lista sobrevive si calza su etiqueta/dueño (conserva todas sus
    // entries filtradas por status) o si tiene ≥1 invitado que calza (solo
    // se muestran las entries que calzan).
    const q = dto.q?.trim().toLowerCase();
    const filtered = !q
      ? mapped
      : mapped.flatMap((l) => {
          const listMatches =
            (l.label ?? "").toLowerCase().includes(q) ||
            l.owner.name.toLowerCase().includes(q);
          if (listMatches) return [l];
          const entries = l.entries.filter((e) =>
            e.person.name.toLowerCase().includes(q),
          );
          return entries.length ? [{ ...l, entries }] : [];
        });

    // Paginación del contrato compartido: el filtro q es post-join (nombres
    // de Person fuera de GuestList), así que el corte va sobre el resultado
    // filtrado - total correcto sobre el universo filtrado.
    const pg = pageParams(dto.page, dto.pageSize);
    return {
      items: filtered.slice(pg.skip, pg.skip + pg.take),
      total: filtered.length,
      page: pg.page,
      pageSize: pg.pageSize,
    };
  }
}

@Controller("guest-lists")
export class GuestListsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Agregar persona a una lista (status PENDING). */
  @Post(":id/entries")
  @UseGuards(SessionGuard, RolesGuard)
  @RequirePermissions("social.manage")
  async addEntry(@Param("id") id: string, @Body() dto: AddEntryDto) {
    const list = await this.prisma.guestList.findUnique({ where: { id } });
    if (!list) throw new NotFoundException("guest list no encontrada");

    const person = await this.prisma.person.findUnique({
      where: { id: dto.personId },
      select: { id: true, name: true, photoUrl: true },
    });
    if (!person) throw new NotFoundException("persona no encontrada");

    const dup = await this.prisma.guestListEntry.findUnique({
      where: {
        guestListId_personId: { guestListId: id, personId: dto.personId },
      },
    });
    if (dup) {
      throw new ConflictException("la persona ya está en esta lista");
    }

    const entry = await this.prisma.guestListEntry.create({
      data: { guestListId: id, personId: dto.personId },
    });
    return { ...entry, person };
  }

  /**
   * Emite el EntryPass LIST de una entrada de la lista. Autorización mixta
   * (sin @RequirePermissions): dueño de la lista, productor del evento o
   * staff con `social.manage`. Idempotente - un EntryPass ACTIVE tipo LIST
   * por (eventId, personId): 201 al crear, 200 si ya existía. Emitir el pase
   * NO marca la entrada como ARRIVED.
   */
  @Post(":listId/entries/:entryId/pass")
  @UseGuards(SessionGuard)
  async issuePass(
    @Param("listId") listId: string,
    @Param("entryId") entryId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const list = await this.prisma.guestList.findUnique({
      where: { id: listId },
    });
    if (!list) throw new NotFoundException("guest list no encontrada");

    const entry = await this.prisma.guestListEntry.findUnique({
      where: { id: entryId },
    });
    if (!entry || entry.guestListId !== list.id) {
      throw new NotFoundException("entrada no encontrada en esta lista");
    }

    const me = req.person!;
    const [event, hasManagePerm] = await Promise.all([
      this.prisma.event.findUnique({
        where: { id: list.eventId },
        select: { producerId: true },
      }),
      roleKeysHavePermission(this.prisma, me.roles, ["social.manage"]),
    ]);
    const allowed =
      list.ownerId === me.id ||
      event?.producerId === me.id ||
      hasManagePerm;
    if (!allowed) {
      throw new ForbiddenException(
        "requiere dueño de la lista, productor del evento o staff",
      );
    }

    const existing = await this.prisma.entryPass.findFirst({
      where: {
        eventId: list.eventId,
        personId: entry.personId,
        type: "LIST",
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
    });
    if (existing) {
      res.status(200);
      return existing;
    }

    return this.prisma.entryPass.create({
      data: {
        eventId: list.eventId,
        personId: entry.personId,
        type: "LIST",
        price: list.specialPrice ?? 0,
        status: "ACTIVE",
      },
    });
  }
}
