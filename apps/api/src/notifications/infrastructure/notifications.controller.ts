import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsIn, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  NotificationDomainError,
  NotificationsService,
  PUSH_PLATFORMS,
  type PushPlatform,
} from "../domain/notifications.service";

class RegisterPushTokenDto {
  @IsString()
  token!: string;

  @IsIn(PUSH_PLATFORMS)
  platform!: PushPlatform;
}

function mapDomainError(e: unknown): never {
  if (e instanceof NotificationDomainError) {
    switch (e.code) {
      case "NOT_FOUND":
        throw new NotFoundException(e.message);
      case "FORBIDDEN":
        throw new ForbiddenException(e.message);
      case "INVALID_CATEGORY":
      case "INVALID_PLATFORM":
        throw new BadRequestException(e.message);
    }
  }
  throw e;
}

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(
    @Req() req: Request,
    @Query("unread") unread?: string,
    @Query("limit") limit?: string,
  ) {
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1) {
        throw new BadRequestException("limit inválido");
      }
      parsedLimit = n;
    }
    return this.notifications.listForPerson(req.person!.id, {
      unread: unread === "true",
      limit: parsedLimit,
    });
  }

  @Post("read-all")
  @HttpCode(200)
  async readAll(@Req() req: Request) {
    const updated = await this.notifications.markAllRead(req.person!.id);
    return { updated };
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@Req() req: Request, @Param("id") id: string) {
    try {
      return await this.notifications.markRead(req.person!.id, id);
    } catch (e) {
      mapDomainError(e);
    }
  }
}

@Controller("push-tokens")
@UseGuards(SessionGuard)
export class PushTokensController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  async register(@Req() req: Request, @Body() dto: RegisterPushTokenDto) {
    try {
      return await this.notifications.registerPushToken(
        req.person!.id,
        dto.token,
        dto.platform,
      );
    } catch (e) {
      mapDomainError(e);
    }
  }

  @Delete(":token")
  async remove(@Req() req: Request, @Param("token") token: string) {
    try {
      await this.notifications.removePushToken(req.person!.id, token);
      return { deleted: true };
    } catch (e) {
      mapDomainError(e);
    }
  }
}
