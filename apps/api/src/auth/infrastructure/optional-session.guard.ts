import { Injectable, type ExecutionContext } from "@nestjs/common";
import { SessionGuard } from "./session.guard";

/**
 * Sesión opcional (spec internal-academy-socials): misma verificación
 * que SessionGuard pero sin lanzar - con credenciales válidas deja
 * `req.person` poblado; sin ellas (o token inválido) la request sigue
 * anónima. Para superficies públicas cuyo contenido cambia con el
 * viewer (feed de eventos, ficha pública). Solo GETs: la barrera de
 * escritura demo vive en SessionGuard y acá se degradaría a anónimo.
 */
@Injectable()
export class OptionalSessionGuard extends SessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(ctx);
    } catch {
      // Sin sesión válida la request sigue como anónima.
      return true;
    }
  }
}
