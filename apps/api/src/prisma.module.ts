import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * PrismaClient único para toda la app — sin esto cada feature module creaba
 * su propia instancia (~13 pools de conexión a Postgres). Módulo compartido
 * normal（非 @Global）：cada feature module 在 imports 里声明依赖，Nest 的
 * 模块单例保证全 app 只有一个 PrismaService；e2e TestingModule 建模块子集
 * 时也能随 feature module 传递解析。
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
