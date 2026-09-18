import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import { PrismaService } from "../../prisma.service";
import { canManageAcademy } from "../domain/academy.service";
import { AcademyAccess } from "./academy-access.service";

class CreateVideoDto {
  /** Link externo (YouTube/Vimeo/Drive) — nunca self-host. */
  @IsString()
  url!: string;

  @IsString()
  title!: string;

  /** Opcional: id de Class (instancia de ClassSlot en una fecha). */
  @IsOptional()
  @IsString()
  classId?: string;

  @IsOptional()
  @IsBoolean()
  restrictedToAttended?: boolean;
}

/**
 * Videos de la academia (links externos). Gate de acceso:
 * - Staff (owner/instructor/ADMIN) ve todo con url.
 * - Alumno/externo: video no restringido → url visible; restringido → url solo
 *   si asistió a la Class asociada (Attendance, unique classId+personId — el
 *   modelo que persiste attendance.controller.ts) o tiene enrollment ACTIVE;
 *   si no, metadatos + locked:true SIN url.
 */
@Controller("academies")
export class VideosController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccess,
  ) {}

  @Post(":id/videos")
  @UseGuards(SessionGuard)
  async create(
    @Param("id") id: string,
    @Body() dto: CreateVideoDto,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!); // solo owner/ADMIN

    if (dto.classId) {
      const cls = await this.prisma.class.findFirst({
        where: { id: dto.classId, slot: { academyId: id } },
      });
      if (!cls) {
        throw new NotFoundException("clase no encontrada en la academia");
      }
    }

    return this.prisma.video.create({
      data: {
        academyId: id,
        url: dto.url,
        title: dto.title,
        classId: dto.classId ?? null,
        restrictedToAttended: dto.restrictedToAttended ?? true,
      },
    });
  }

  @Get(":id/videos")
  @UseGuards(SessionGuard)
  async list(@Param("id") id: string, @Req() req: Request) {
    const { ctx } = await this.access.loadContext(id);
    const me = req.person!;

    const videos = await this.prisma.video.findMany({
      where: { academyId: id },
      orderBy: { createdAt: "desc" },
    });

    if (canManageAcademy({ id: me.id, roles: me.roles }, ctx)) {
      return videos; // staff ve todo con url
    }

    const classIds = [
      ...new Set(
        videos
          .filter((v) => v.restrictedToAttended && v.classId)
          .map((v) => v.classId as string),
      ),
    ];
    const [attendances, activeEnrollment] = await Promise.all([
      classIds.length
        ? this.prisma.attendance.findMany({
            where: { personId: me.id, classId: { in: classIds } },
            select: { classId: true },
          })
        : Promise.resolve([]),
      this.prisma.enrollment.findFirst({
        where: { academyId: id, personId: me.id, status: "ACTIVE" },
        select: { id: true },
      }),
    ]);
    const attended = new Set(attendances.map((a) => a.classId));

    return videos.map((v) => {
      if (!v.restrictedToAttended) return v;
      const unlocked =
        (v.classId !== null && attended.has(v.classId)) ||
        activeEnrollment !== null;
      if (unlocked) return { ...v, locked: false };
      return {
        id: v.id,
        title: v.title,
        classId: v.classId,
        restrictedToAttended: true,
        locked: true,
      };
    });
  }

  @Delete(":id/videos/:videoId")
  @UseGuards(SessionGuard)
  async remove(
    @Param("id") id: string,
    @Param("videoId") videoId: string,
    @Req() req: Request,
  ) {
    await this.access.requireAdminister(id, req.person!); // solo owner/ADMIN
    const video = await this.prisma.video.findFirst({
      where: { id: videoId, academyId: id },
    });
    if (!video) throw new NotFoundException("video no encontrado en la academia");
    return this.prisma.video.delete({ where: { id: video.id } });
  }
}
