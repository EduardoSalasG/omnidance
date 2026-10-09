import type { PrismaService } from "../src/prisma.service";

/**
 * Teardown compartido de personas en e2e: las suites comparten la DB y
 * una notificación async (campaign send, notifySafe) puede aterrizar
 * entre el cleanup de cada suite y el delete de persons → FK. Reintenta
 * re-limpiando notifications; en el último intento propaga el error.
 * Llamar como último paso del afterAll, después de limpiar el resto de
 * FKs propias de la suite (roles, events, tickets, etc.).
 */
export async function deletePeople(
  prisma: PrismaService,
  ids: string[],
): Promise<void> {
  for (let i = 0; i < 4; i++) {
    try {
      await prisma.person.deleteMany({ where: { id: { in: ids } } });
      return;
    } catch (e) {
      if (i === 3) throw e;
      await prisma.notification.deleteMany({
        where: { personId: { in: ids } },
      });
    }
  }
}
