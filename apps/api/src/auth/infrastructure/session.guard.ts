import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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
    person?: {
      id: string;
      // roles APPROVED únicamente — lo que la persona puede ejercer.
      roles: string[];
      // estado completo de sus roles (para RBAC y UI "en revisión").
      roleStates: { role: string; status: string }[];
      // cuenta creada desde un lead de /pro — solo lectura (ver barrera abajo).
      isDemo?: boolean;
    };
  }
}

// Cuentas demo: navegan y leen toda la app (GETs pasan con sus roles
// APPROVED), pero ninguna escritura llega a producción — POST/PUT/PATCH/
// DELETE → 403 "demo_mode". La whitelist es solo self-scoped y sin valor
// de negocio: salir, marcar notificaciones leídas, push tokens y
// reclamar la cuenta con contraseña propia.
const DEMO_ALLOWED_WRITES = [
  /^\/api\/auth\/(logout|password)$/,
  /^\/api\/notifications\//,
  /^\/api\/push-tokens/,
  // Cierre del flujo de conversión de lead — es justamente la escritura
  // que apaga isDemoAccount.
  /^\/api\/me\/complete-profile$/,
];

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

    req.person = {
      id: person.id,
      roles: person.roles
        .filter((r) => r.status === "APPROVED")
        .map((r) => r.role),
      roleStates: person.roles,
      isDemo: person.isDemoAccount,
    };

    // Barrera de escritura para cuentas demo — el único punto de control,
    // aplica a toda ruta protegida sin flags repartidos por el código.
    if (
      person.isDemoAccount &&
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS" &&
      !DEMO_ALLOWED_WRITES.some((re) => re.test(req.path))
    ) {
      throw new ForbiddenException("demo_mode");
    }

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
