import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma.module";
import { FeatureFlagsService } from "./feature-flags.service";
import { FeaturesController } from "./features.controller";

/**
 * Módulo de feature flags (spec feature-flags-admin): mapa público
 * GET /features + FeatureFlagsService compartido. El service lo
 * consume AdminModule para la consola /admin/funcionalidades y queda
 * exportado para gates server-side (`isEnabled` en otros módulos).
 */
@Module({
  imports: [PrismaModule],
  controllers: [FeaturesController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeaturesModule {}
