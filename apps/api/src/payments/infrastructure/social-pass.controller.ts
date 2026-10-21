import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { SessionGuard } from "../../auth/infrastructure/session.guard";
import {
  SocialPassConflictError,
  SocialPassService,
  SocialPassUnavailableError,
} from "../application/social-pass.service";

class ConfirmDto {
  /** cs_… de la Checkout Session si la success_url lo trajo (Stripe
      sustituye {CHECKOUT_SESSION_ID}); opcional - el service también
      resuelve listando las subs del customer. */
  @IsOptional()
  @IsString()
  sessionId?: string;
}

/**
 * Pase Social del bailarín (spec pase-social): todo gated por el flag
 * `social_pass` - OFF → 404 en todos los endpoints. El servicio resuelve
 * el adaptador STRIPE del registry explícitamente (no el param
 * payments.subscription_gateway, que sigue en Flow para academia/
 * productor); sin credenciales Stripe → 503.
 */
@Controller("me/social-pass")
@UseGuards(SessionGuard)
export class SocialPassController {
  constructor(private readonly passes: SocialPassService) {}

  @Get()
  getMine(@Req() req: Request) {
    return this.wrap(() => this.passes.getMine(req.person!.id));
  }

  @Post("subscribe")
  subscribe(@Req() req: Request) {
    return this.wrap(() => this.passes.subscribe(req.person!.id));
  }

  @Post("cancel")
  cancel(@Req() req: Request) {
    return this.wrap(() => this.passes.cancel(req.person!.id));
  }

  /**
   * Confirmación al volver de Stripe Checkout (dev sin webhook): el
   * front pega la session_id de la success_url o deja que el service
   * liste las subs del customer. Idempotente.
   */
  @Post("confirm")
  confirm(@Req() req: Request, @Body() dto: ConfirmDto) {
    return this.wrap(() => this.passes.confirm(req.person!.id, dto.sessionId));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SocialPassUnavailableError) {
        throw new ServiceUnavailableException(e.message);
      }
      if (e instanceof SocialPassConflictError) {
        throw new ConflictException(e.message);
      }
      if (
        e instanceof NotFoundException ||
        e instanceof BadRequestException
      ) {
        throw e;
      }
      throw e;
    }
  }
}
