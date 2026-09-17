import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";

/** GET /api/styles — catálogo público de estilos (selects del front). */
@Controller("styles")
export class StylesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.style.findMany({
      select: { id: true, name: true, genre: true },
      orderBy: { name: "asc" },
    });
  }
}
