import { describe, expect, it } from "vitest";
import { suggestedEndsAt } from "./shared";

// spec academies/console-lists (change academy-students-ux): la
// sugerencia de "pagado hasta" del alta es espejo de membershipEndsAt
// del dominio (payments/domain/membership-vigency.ts).
describe("suggestedEndsAt", () => {
  it("MONTHLY → último día del mes calendario del inicio", () => {
    expect(
      suggestedEndsAt({ type: "MONTHLY", periodDays: null }, "2026-10-12"),
    ).toBe("2026-10-31");
  });

  it("QUARTERLY → fin del 3er mes calendario", () => {
    expect(
      suggestedEndsAt({ type: "QUARTERLY", periodDays: null }, "2026-10-12"),
    ).toBe("2026-12-31");
  });

  it("SEMIANNUAL → fin del 6º mes calendario", () => {
    expect(
      suggestedEndsAt(
        { type: "SEMIANNUAL", periodDays: null },
        "2026-10-12",
      ),
    ).toBe("2027-03-31");
  });

  it("SINGLE → día siguiente al inicio", () => {
    expect(
      suggestedEndsAt({ type: "SINGLE", periodDays: null }, "2026-10-31"),
    ).toBe("2026-11-01");
  });

  it("PERIOD con periodDays → inicio + días", () => {
    expect(
      suggestedEndsAt({ type: "PERIOD", periodDays: 30 }, "2026-10-12"),
    ).toBe("2026-11-11");
  });

  it("TRIAL con periodDays → inicio + días; sin periodDays → vacío", () => {
    expect(
      suggestedEndsAt({ type: "TRIAL", periodDays: 7 }, "2026-10-12"),
    ).toBe("2026-10-19");
    expect(
      suggestedEndsAt({ type: "TRIAL", periodDays: null }, "2026-10-12"),
    ).toBe("");
  });

  it("CLASS_PACK → sin fecha (vence por consumo)", () => {
    expect(
      suggestedEndsAt({ type: "CLASS_PACK", periodDays: null }, "2026-10-12"),
    ).toBe("");
  });

  it("cruce de año en QUARTERLY (noviembre → fin de enero)", () => {
    expect(
      suggestedEndsAt(
        { type: "QUARTERLY", periodDays: null },
        "2026-11-15",
      ),
    ).toBe("2027-01-31");
  });
});
