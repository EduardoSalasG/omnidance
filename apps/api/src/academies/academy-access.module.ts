import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { AcademyAccess } from "./infrastructure/academy-access.service";

/**
 * AcademyAccess en módulo propio (spec academy-staff-roles): las reglas de
 * capacidad las consumen también otros módulos (p.ej. payments para
 * GET /payments/by-academy/:id) sin importar AcademiesModule completo -
 * así no se crea el ciclo academies ⇄ payments.
 */
@Module({
  imports: [PrismaModule],
  providers: [AcademyAccess],
  exports: [AcademyAccess],
})
export class AcademyAccessModule {}
