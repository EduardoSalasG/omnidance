import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { PENDING_USABLE_ROLES } from "../../common/rbac/roles.guard";
import { AuthService } from "../domain/auth.service";
import { AUTH_REPO, type AuthRepo } from "../domain/ports";
import { SESSION_COOKIE } from "./auth.controller";

declare module "express" {
  interface Request {
    person?: {
      id: string;
      // roles APPROVED únicamente - lo que la persona puede ejercer.
      roles: string[];
      // estado completo de sus roles (para RBAC y UI "en revisión").
      roleStates: { role: string; status: string }[];
      // cuenta creada desde un lead de /pro - solo lectura (ver barrera abajo).
      isDemo?: boolean;
      // claim jti del JWT (spec auth-sessions): identifica la fila
      // AuthSession de esta request - /me/sessions la marca como
      // `current` y revoke-others la excluye. Ausente en tokens
      // pre-change (siguen válidos sin revocación hasta expirar).
      jti?: string;
    };
  }
}

// Cuentas demo: navegan y leen toda la app (GETs pasan con sus roles
// APPROVED), pero ninguna escritura llega a producción - POST/PUT/PATCH/
// DELETE → 403 "demo_mode". La whitelist es solo self-scoped y sin valor
// de negocio: salir, marcar notificaciones leídas, push tokens y
// reclamar la cuenta con contraseña propia.
const DEMO_ALLOWED_WRITES = [
  /^\/api\/auth\/(logout|password)$/,
  /^\/api\/notifications\//,
  /^\/api\/push-tokens/,
  // Cierre del flujo de conversión de lead - es justamente la escritura
  // que apaga isDemoAccount.
  /^\/api\/me\/complete-profile$/,
  // Aceptación legal self-scoped (spec legal-consent): la cuenta demo
  // también debe poder registrarla si el aviso aparece.
  /^\/api\/me\/consent$/,
  // Preview del motor de consultas (analytics/query-console): POST solo
  // porque los filtros viajan en el body - es lectura scopiada al actor.
  /^\/api\/query\/run$/,
];

// Sesiones persistidas (spec auth-sessions): un JWT con claim jti exige
// fila AuthSession viva (revokedAt null). El lookup corre por request
// con cache in-memory de 60s por jti - sin cache sería 1 read indexado
// por request autenticada; con cache queda ~1 read/min por sesión y las
// revocaciones tardan a lo más 60s en propagar a esta instancia.
const SESSION_CACHE_MS = 60_000;
// lastSeenAt con muestreo: máx 1 write por minuto por jti (spec).
const LAST_SEEN_WRITE_MS = 60_000;
// Toque de las tablas in-memory: se limpian al pasar este tamaño para
// no crecer sin tope con jtis de tokens expirados.
const SESSION_MAPS_PRUNE_AT = 10_000;

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly sessionState = new Map<
    string,
    { revoked: boolean; checkedAt: number }
  >();
  private readonly sessionSeenWrites = new Map<string, number>();

  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_REPO) private readonly repo: AuthRepo,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException();

    let personId: string;
    let jti: string | undefined;
    try {
      ({ personId, jti } = await this.auth.verifySession(token));
    } catch {
      throw new UnauthorizedException();
    }

    // Revocación (spec auth-sessions): solo aplica a tokens con jti -
    // los pre-change sin claim siguen válidos hasta expirar.
    if (jti) await this.assertSessionLive(jti);

    const person = await this.repo.findById(personId);
    // Cuenta con baja lógica (deletedAt): sesión inválida de inmediato -
    // sus datos siguen intactos pero no puede operar.
    if (!person || person.deletedAt) throw new UnauthorizedException();

    req.person = {
      id: person.id,
      jti,
      roles: person.roles
        .filter(
          (r) =>
            r.status === "APPROVED" ||
            // PENDING usable: owners/productores registrados por
            // landing operan su consola invisibles hasta validación.
            (r.status === "PENDING" && PENDING_USABLE_ROLES.has(r.role)),
        )
        .map((r) => r.role),
      roleStates: person.roles,
      isDemo: person.isDemoAccount,
    };

    // Barrera de escritura para cuentas demo - el único punto de control,
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

  /**
   * Sesión viva por jti (spec auth-sessions): AuthSession existe y no
   * está revocada. jti desconocido → 401: un token firmado post-change
   * siempre tiene su fila (issueSession la persiste antes de firmar).
   * Repo sin soporte (fakes legados) → JWT puro, como antes.
   */
  private async assertSessionLive(jti: string): Promise<void> {
    const find = this.repo.findAuthSessionByJti?.bind(this.repo);
    if (!find) return;
    const now = Date.now();
    const cached = this.sessionState.get(jti);
    if (cached && now - cached.checkedAt < SESSION_CACHE_MS) {
      if (cached.revoked) throw new UnauthorizedException();
    } else {
      const row = await find(jti);
      const revoked = !row || row.revokedAt !== null;
      this.sessionState.set(jti, { revoked, checkedAt: now });
      this.pruneSessionMaps(now);
      if (revoked) throw new UnauthorizedException();
    }
    // lastSeenAt con muestreo: máx 1 write/min por jti; el write es
    // best-effort - su fallo nunca tumba una request válida.
    if (now - (this.sessionSeenWrites.get(jti) ?? 0) >= LAST_SEEN_WRITE_MS) {
      this.sessionSeenWrites.set(jti, now);
      try {
        await this.repo.touchAuthSession?.(jti);
      } catch {
        /* telemetría de actividad, no control de acceso */
      }
    }
  }

  // Limpieza acotada: al crecer las tablas se descartan las entradas
  // stale; las que sigan vivas se re-consultan en el próximo request.
  private pruneSessionMaps(now: number): void {
    if (this.sessionState.size > SESSION_MAPS_PRUNE_AT) {
      for (const [jti, s] of this.sessionState) {
        if (now - s.checkedAt >= SESSION_CACHE_MS) this.sessionState.delete(jti);
      }
    }
    if (this.sessionSeenWrites.size > SESSION_MAPS_PRUNE_AT) {
      for (const [jti, ts] of this.sessionSeenWrites) {
        if (now - ts >= LAST_SEEN_WRITE_MS) this.sessionSeenWrites.delete(jti);
      }
    }
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
