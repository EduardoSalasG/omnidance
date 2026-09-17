import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { DiscountsService } from "./domain/discounts.service";
import { DISCOUNTS_REPO, type DiscountsRepo } from "./domain/ports";
import { DiscountsController } from "./infrastructure/discounts.controller";
import { PrismaDiscountsRepo } from "./infrastructure/prisma-discounts.repo";

@Module({
  imports: [AuthModule],
  controllers: [DiscountsController],
  providers: [
    PrismaService,
    { provide: DISCOUNTS_REPO, useClass: PrismaDiscountsRepo },
    {
      provide: DiscountsService,
      useFactory: (repo: DiscountsRepo) => new DiscountsService(repo),
      inject: [DISCOUNTS_REPO],
    },
  ],
  exports: [DiscountsService],
})
export class DiscountsModule {}
