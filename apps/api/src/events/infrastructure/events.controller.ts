import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { EVENT_RECENT_LOOKBACK_MS } from "@omnidance/shared";
import { PrismaService } from "../../prisma.service";

@Controller("events")
export class EventsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.event.findMany({
      where: {
        status: { in: ["PUBLISHED", "LIVE"] },
        startsAt: { gte: new Date(Date.now() - EVENT_RECENT_LOOKBACK_MS) },
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        presalePrice: true,
        doorPrice: true,
        series: { select: { name: true } },
        venue: { select: { name: true, address: true } },
      },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        presalePrice: true,
        doorPrice: true,
        primeThreshold: true,
        series: { select: { name: true } },
        venue: { select: { name: true, address: true, capacity: true } },
        djs: {
          select: {
            slotNote: true,
            person: { select: { name: true, photoUrl: true } },
          },
        },
        scheduleBlocks: {
          orderBy: { startsAt: "asc" },
          select: {
            startsAt: true,
            endsAt: true,
            style: { select: { name: true } },
          },
        },
      },
    });
    if (!event) throw new NotFoundException();
    return event;
  }
}
