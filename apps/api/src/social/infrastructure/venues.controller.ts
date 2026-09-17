import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../prisma.service";

/**
 * Directorio público de venues activos — el front lo usa para selects
 * (crear práctica, filtrar eventos). Sin datos sensibles: solo lo que
 * ya se expone vía GET /events → event.venue.
 */
@Controller("venues")
export class VenuesController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/venues → [{ id, name, address, capacity }] active, por nombre. */
  @Get()
  async list() {
    const venues = await this.prisma.venue.findMany({
      where: { active: true },
      select: { id: true, name: true, address: true, capacity: true },
    });
    // Orden en JS (localeCompare) — Postgres collation y JS difieren en
    // espacios/mayúsculas y el contrato del endpoint es orden por nombre.
    return venues.sort((a, b) => a.name.localeCompare(b.name));
  }
}
