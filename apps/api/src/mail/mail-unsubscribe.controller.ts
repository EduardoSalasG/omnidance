import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import { PrismaService } from "../prisma.service";
import { unsubscribeToken } from "./mail-campaigns.service";

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${title}</title></head><body style="font-family:sans-serif;` +
  `max-width:480px;margin:48px auto;padding:0 16px;color:#eee;` +
  `background:#111"><h1 style="font-size:20px">${title}</h1>` +
  `<p>${body}</p></body></html>`;

/**
 * Baja de campañas de mail (spec platform-polish-gaps): ruta PÚBLICA
 * — llega desde el footer del correo sin sesión. La firma HMAC del
 * personId (JWT_SECRET) es la autorización; no hay token persistido.
 * Solo afecta correos de campañas: los transaccionales (magic link,
 * recibos) siguen llegando.
 */
@Controller("mail")
export class MailUnsubscribeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("unsubscribe")
  async unsubscribe(
    @Query("p") personId: string,
    @Query("t") token: string,
    @Res() res: Response,
  ) {
    const expected = personId ? unsubscribeToken(personId) : "";
    const valid =
      !!token &&
      token.length === expected.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(expected));
    if (!valid) throw new BadRequestException("enlace inválido");
    const updated = await this.prisma.person.updateMany({
      where: { id: personId },
      data: { mailOptOutAt: new Date() },
    });
    res.type("html").send(
      updated.count === 0
        ? PAGE("Enlace inválido", "Este enlace de baja no corresponde a una cuenta vigente.")
        : PAGE(
            "Suscripción cancelada",
            "Listo — no recibirás más correos de campañas. Los correos de tu cuenta (acceso, recibos) siguen llegando normalmente.",
          ),
    );
  }
}
