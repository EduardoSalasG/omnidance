import { Controller, Get, Query } from "@nestjs/common";
import { IsIn, IsOptional, IsString, Matches } from "class-validator";
import { ConsentService } from "./consent.service";
import { resolveJurisdiction, type Jurisdiction } from "./jurisdiction";

class LegalConsentQuery {
  // País declarado (ISO-3166 alpha-2) - el registro lo envía para
  // saber qué ley aplica y qué form renderizar.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  country?: string;

  // Alternativa: jurisdicción ya resuelta (ConsentBanner consulta por
  // la jurisdiction persistida de la Person, no por país).
  @IsOptional()
  @IsIn(["CL", "EU"])
  jurisdiction?: Jurisdiction;
}

/**
 * GET /legal/consent - texto legal vigente por jurisdicción (spec
 * consent-por-jurisdiccion). Público, sin guard: lo llama el form de
 * registro antes de que exista sesión. Resuelve la jurisdicción por
 * `country` (o la toma directa por `jurisdiction`) y devuelve versión
 * vigente + requiredScopes + granular. Sin texto activo para la
 * jurisdicción → fallback al CL (fail-open, nunca 404).
 */
@Controller("legal")
export class LegalController {
  constructor(private readonly consent: ConsentService) {}

  @Get("consent")
  async current(@Query() query: LegalConsentQuery) {
    const jurisdiction =
      query.jurisdiction ?? resolveJurisdiction(query.country);
    return this.consent.currentConsentPayload(jurisdiction);
  }
}
