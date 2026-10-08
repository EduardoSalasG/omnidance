import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma.module";
import { QueryController } from "./query.controller";
import { QueryService } from "./query.service";

/**
 * Motor de consultas compartido (spec analytics/query-console). Las
 * entidades del registry son funciones puras sobre prisma (sin DI) -
 * BrowseController y los exports de EventsController las importan
 * directo; el servicio orquesta lens-check + scope + catálogo + saved.
 */
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
