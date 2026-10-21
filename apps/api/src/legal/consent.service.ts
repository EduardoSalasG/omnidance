import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { CONSENT_VERSION } from "@omnidance/shared";
import { PrismaService } from "../prisma.service";
import type { Jurisdiction } from "./jurisdiction";

// Scopes aceptables por el cliente. `essential` es siempre requerido
// (no existe opt-out del tratamiento necesario para operar la app);
// marketing/analytics son opt-in y solo se persisten si el LegalText
// vigente de la jurisdicción los declara en requiredScopes.
export type ConsentScopes = {
  essential?: boolean;
  marketing?: boolean;
  analytics?: boolean;
};

// Fallback cuando no hay LegalText sembrado: comportamiento legacy del
// consentimiento único chileno (spec consent-por-jurisdiccion -
// "fail-open al texto baseline, nunca bloquea el registro").
const BASELINE_SCOPES = ["essential"];

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * LegalText vigente de la jurisdicción: el `active` más reciente.
   * Si la jurisdicción no tiene texto activo, cae al CL (nunca null
   * por una jurisdicción aún sin texto publicado).
   */
  async currentText(jurisdiction: string) {
    const own = await this.prisma.legalText.findFirst({
      where: { jurisdiction, active: true },
      orderBy: { publishedAt: "desc" },
    });
    if (own) return own;
    return this.prisma.legalText.findFirst({
      where: { jurisdiction: "CL", active: true },
      orderBy: { publishedAt: "desc" },
    });
  }

  /**
   * Payload público de GET /legal/consent. Sin ningún texto sembrado
   * responde el baseline legacy (CONSENT_VERSION, essential único) -
   * el registro nunca se bloquea por falta de catálogo.
   */
  async currentConsentPayload(jurisdiction: Jurisdiction) {
    const text = await this.currentText(jurisdiction);
    return {
      version: text?.version ?? CONSENT_VERSION,
      body: text?.body ?? "",
      requiredScopes: text?.requiredScopes ?? BASELINE_SCOPES,
      granular: text?.granular ?? false,
      jurisdiction,
    };
  }

  /**
   * Registra una aceptación (spec consent-por-jurisdiccion -
   * "Registro auditable por aceptación"): ConsentRecord por evento +
   * snapshot Person.consentVersion/consentAcceptedAt, en una sola
   * transacción.
   *
   * - La versión estampada es SIEMPRE la vigente del servidor para la
   *   jurisdicción de la persona (aceptar una versión antigua no
   *   tiene sentido); el `version` que declara el cliente es
   *   informativo.
   * - Solo se persisten scopes declarados en requiredScopes del
   *   LegalText vigente: un `marketing` enviado en CL se ignora.
   * - `essential` queda siempre true (es requerido por definición).
   */
  async recordAcceptance(
    personId: string,
    scopes?: ConsentScopes | null,
  ): Promise<{ version: string; acceptedAt: Date; jurisdiction: string }> {
    const person = await this.prisma.person.findUniqueOrThrow({
      where: { id: personId },
      select: { jurisdiction: true },
    });
    const jurisdiction = person.jurisdiction ?? "CL";
    const text = await this.currentText(jurisdiction);
    const version = text?.version ?? CONSENT_VERSION;
    const requiredScopes = text?.requiredScopes ?? BASELINE_SCOPES;

    const persisted: Record<string, boolean> = {};
    for (const scope of requiredScopes) {
      persisted[scope] =
        scope === "essential"
          ? true
          : scopes?.[scope as keyof ConsentScopes] === true;
    }

    const acceptedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.consentRecord.create({
        data: {
          personId,
          jurisdiction,
          version,
          scopes: persisted as Prisma.InputJsonObject,
        },
      }),
      this.prisma.person.update({
        where: { id: personId },
        data: { consentVersion: version, consentAcceptedAt: acceptedAt },
      }),
    ]);
    return { version, acceptedAt, jurisdiction };
  }
}
