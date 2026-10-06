import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { JobsService } from "./jobs.service";
import { JobsRunner } from "./jobs.runner";
import { JOB_REGISTRY, JobRegistry } from "./registry";

/**
 * Infra de jobs programados (spec admin-jobs-mail-campaigns).
 * @Global como StorageModule: cualquier módulo puede inyectar
 * JOB_REGISTRY para registrar sus jobs sin import explícito, y el
 * AdminJobsController resuelve JobsService.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: JOB_REGISTRY, useClass: JobRegistry },
    JobsService,
    JobsRunner,
  ],
  exports: [JOB_REGISTRY, JobsService],
})
export class JobsModule {}
