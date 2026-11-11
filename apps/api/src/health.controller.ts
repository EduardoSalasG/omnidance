import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "./prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Ping barato del balanceador/monitoreo (spec api-hardening): no toca
  // la DB - un flood de health checks ya no se convierte en queries a
  // Postgres. Tampoco cuenta para el rate limit.
  @Get()
  @SkipThrottle()
  check() {
    return { status: "ok", service: "omnidance-api" };
  }

  // Check de dependencia real (DB) - endpoint aparte y CON throttler:
  // no es gratis como el ping y un flood sí costaría queries.
  @Get("db")
  async checkDb() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok", db: "up", service: "omnidance-api" };
  }
}
