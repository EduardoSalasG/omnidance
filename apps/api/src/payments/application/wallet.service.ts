import { Injectable } from "@nestjs/common";
import { SignJWT, importPKCS8 } from "jose";
import { PrismaService } from "../../prisma.service";

/**
 * Google Wallet como lanzador (spec wallet-passes): emite el saveUrl
 * "Add to Google Wallet" con un GenericPass cuyo único contenido
 * accionable es el deep link a /qr - sin barcode propio (decisión de
 * producto: el QR personal rotativo es la credencial canónica; un
 * RotatingBarcode no puede reproducir el JWT HS256 del QR).
 *
 * Credenciales vía env (sin ellas el feature queda apagado →
 * `configured()` false → el controller responde 503 y el front oculta
 * el botón):
 * - GOOGLE_WALLET_ISSUER_ID: issuer id del panel Google Wallet.
 * - GOOGLE_WALLET_SA_EMAIL: service account con acceso al issuer.
 * - GOOGLE_WALLET_SA_PRIVATE_KEY: clave PEM (con \n escapados).
 *
 * El JWT (`typ: savetowallet`) lleva la clase+objeto inline - Google
 * las materializa al guardar, sin API calls previas.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private issuerId() {
    return process.env.GOOGLE_WALLET_ISSUER_ID ?? null;
  }
  private saEmail() {
    return process.env.GOOGLE_WALLET_SA_EMAIL ?? null;
  }
  private saKey() {
    const raw = process.env.GOOGLE_WALLET_SA_PRIVATE_KEY;
    return raw ? raw.replace(/\\n/g, "\n") : null;
  }

  configured(): boolean {
    return !!(this.issuerId() && this.saEmail() && this.saKey());
  }

  /** saveUrl del pase lanzador del usuario; null sin credenciales. */
  async googleSaveUrl(personId: string) {
    if (!this.configured()) return null;
    const issuerId = this.issuerId()!;
    const classId = `${issuerId}.omnidance-qr`;
    const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
    const person = await this.prisma.person.findUnique({
      where: { id: personId },
      select: { name: true },
    });

    const key = await importPKCS8(this.saKey()!, "RS256");
    const jwt = await new SignJWT({
      payload: {
        genericClasses: [{ id: classId }],
        genericObjects: [
          {
            id: `${issuerId}.person-${personId}`,
            classId,
            state: "ACTIVE",
            cardTitle: {
              defaultValue: {
                language: "es-CL",
                value: "Omnidance - QR de acceso",
              },
            },
            header: {
              defaultValue: {
                language: "es-CL",
                value: person?.name ?? "Bailarín",
              },
            },
            subheader: {
              defaultValue: {
                language: "es-CL",
                value: "Toca el link para abrir tu QR",
              },
            },
            linksModuleData: {
              uris: [
                {
                  id: "qr-link",
                  uri: `${webUrl}/qr`,
                  description: "Abrir mi QR",
                },
              ],
            },
          },
        ],
      },
    })
      .setProtectedHeader({ alg: "RS256", typ: "savetowallet" })
      .setIssuer(this.saEmail()!)
      .setAudience("google")
      .setIssuedAt()
      .sign(key);

    return `https://pay.google.com/gp/v/save/${jwt}`;
  }
}
