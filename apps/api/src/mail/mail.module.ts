import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { JobsModule } from "../jobs/jobs.module";
import { PrismaModule } from "../prisma.module";
import { MailCampaignsService } from "./mail-campaigns.service";
import { MailCampaignsController } from "./mail-campaigns.controller";

/**
 * Campañas de mail programadas (spec admin-jobs-mail-campaigns).
 * JOB_REGISTRY viene del JobsModule @Global; MAILER del AuthModule.
 */
@Module({
  imports: [PrismaModule, AuthModule, JobsModule],
  controllers: [MailCampaignsController],
  providers: [MailCampaignsService],
})
export class MailModule {}
