import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma.service";
import { roleKeysHavePermission } from "./rbac/roles.guard";

/**
 * Scoping de actor por evento (spec event-access-scope): el permiso
 * global del guard (checkins.write, social.manage, discounts.manage…)
 * no basta sobre un evento ajeno - el actor debe ser admin
 * (`admin.access`/superuser), el productor dueño (`event.producerId`)
 * o staff asignado (StaffAssignment, misma fuente que doorSale/
 * voidCheckin). 404 si el evento no existe; 403 genérico si no está
 * vinculado - los eventos son públicos, no se oculta su existencia.
 */
export async function requireEventActor(
  prisma: PrismaService,
  eventId: string,
  person: { id: string; roles: string[] },
): Promise<void> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { producerId: true },
  });
  if (!event) throw new NotFoundException("evento no encontrado");
  if (event.producerId === person.id) return;

  const [admin, assigned] = await Promise.all([
    roleKeysHavePermission(prisma, person.roles, ["admin.access"]),
    prisma.staffAssignment.findUnique({
      where: { eventId_personId: { eventId, personId: person.id } },
      select: { id: true },
    }),
  ]);
  if (!admin && !assigned) {
    throw new ForbiddenException(
      "requiere staff asignado al evento, productor o admin",
    );
  }
}
