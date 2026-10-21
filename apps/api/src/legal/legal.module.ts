import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { ConsentService } from "./consent.service";
import { LegalController } from "./legal.controller";

/**
 * Módulo legal (spec consent-por-jurisdiccion): catálogo de textos por
 * jurisdicción (GET /legal/consent público) + ConsentService compartido
 * - la misma lógica de registro auditable la usan POST /me/consent
 * (PeopleModule) y los altas/logins con consent declarado (AuthModule).
 */
@Module({
  imports: [PrismaModule],
  controllers: [LegalController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class LegalModule {}
