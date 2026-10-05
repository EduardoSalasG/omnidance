import { describe, expect, it } from "vitest";
import { sortWalletTickets } from "./wallet-sort";

// Guard contra el crash de /tickets/mine: el API devuelve event:null
// cuando el evento fue eliminado tras la compra - el orden debe
// tolerarlo y enviar esos tickets al final.
describe("sortWalletTickets", () => {
  it("ordena por startsAt descendente", () => {
    const tickets = [
      { id: "old", event: { startsAt: "2025-01-01T00:00:00Z" } },
      { id: "new", event: { startsAt: "2025-06-01T00:00:00Z" } },
      { id: "mid", event: { startsAt: "2025-03-01T00:00:00Z" } },
    ];
    expect(sortWalletTickets(tickets).map((x) => x.id)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  it("deja los tickets huérfanos (event null) al final sin crashear", () => {
    const tickets = [
      { id: "orphan1", event: null },
      { id: "new", event: { startsAt: "2025-06-01T00:00:00Z" } },
      { id: "orphan2", event: null },
      { id: "old", event: { startsAt: "2025-01-01T00:00:00Z" } },
    ];
    expect(sortWalletTickets(tickets).map((x) => x.id)).toEqual([
      "new",
      "old",
      "orphan1",
      "orphan2",
    ]);
  });

  it("no muta el array original", () => {
    const tickets = [
      { id: "a", event: null },
      { id: "b", event: { startsAt: "2025-06-01T00:00:00Z" } },
    ];
    sortWalletTickets(tickets);
    expect(tickets.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
