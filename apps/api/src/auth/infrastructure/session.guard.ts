import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "../domain/auth.service";
import { AUTH_REPO, type AuthRepo } from "../domain/ports";
import { SESSION_COOKIE } from "./auth.controller";

declare module "express" {
  interface Request {
    person?: { id: string; roles: string[] };
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_REPO) private readonly repo: AuthRepo,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException();

    let personId: string;
    try {
      ({ personId } = await this.auth.verifySession(token));
    } catch {
      throw new UnauthorizedException();
    }

    const person = await this.repo.findById(personId);
    if (!person) throw new UnauthorizedException();

    req.person = { id: person.id, roles: person.roles.map((r) => r.role) };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice(7);
    const cookie = req.headers.cookie
      ?.split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    return cookie?.split("=")[1];
  }
}
