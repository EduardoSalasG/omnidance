/**
 * Orden de la wallet: más futuro/reciente primero — lo próximo es lo
 * que se usa en puerta. El API puede devolver `event: null` cuando el
 * evento fue eliminado tras la compra (GET /tickets/mine hace
 * `byId.get(t.eventId) ?? null`): esos tickets quedan al final y nunca
 * crashean el sort.
 */
export function sortWalletTickets<
  T extends { event: { startsAt: string } | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.event === null) return b.event === null ? 0 : 1;
    if (b.event === null) return -1;
    return (
      new Date(b.event.startsAt).getTime() -
      new Date(a.event.startsAt).getTime()
    );
  });
}
