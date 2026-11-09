import { describe, expect, it } from "vitest";
import { suggestedEndsAt } from "./shared";

// spec academies/console-lists (change academy-students-ux): la
// sugerencia de "pagado hasta" del alta es espejo de la vigencia
// rodante de membershipEndsAt del dominio (payments/domain/
// membership-vigency.ts): base + duración del plan.
describe("suggestedEndsAt", () => {
  it("MONTHLY → inicio + 1 mes (mismo día)", () => {
    expect(
      suggestedEndsAt({ type: "MONTHLY", periodDays: null }, "2026-10-12"),
    ).toBe("2026-11-12");
  });

  it("QUARTERLY → inicio + 3 meses", () => {
    expect(
      suggestedEndsAt({ type: "QUARTERLY", periodDays: null }, "2026-10-12"),
    ).toBe("2027-01-12");
  });

  it("SEMIANNUAL → inicio + 6 meses", () => {
    expect(
      suggestedEndsAt(
        { type: "SEMIANNUAL", periodDays: null },
        "2026-10-12",
      ),
    ).toBe("2027-04-12");
  });

  it("clamp de fin de mes: 31 ene + 1 mes → último día de feb", () => {
    expect(
      suggestedEndsAt({ type: "MONTHLY", periodDays: null }, "2026-01-31"),
    ).toBe("2026-02-28");
    expect(
      suggestedEndsAt(
        { type: "SEMIANNUAL", periodDays: null },
        "2026-08-31",
      ),
    ).toBe("2027-02-28");
  });

  it("SINGLE → día siguiente al inicio", () => {
    expect(
      suggestedEndsAt({ type: "SINGLE", periodDays: null }, "2026-10-31"),
    ).toBe("2026-11-01");
  });

  it("PERIOD con periodDays → inicio + días; sin periodDays → vacío", () => {
    expect(
      suggestedEndsAt({ type: "PERIOD", periodDays: 30 }, "2026-10-12"),
    ).toBe("2026-11-11");
    expect(
      suggestedEndsAt({ type: "PERIOD", periodDays: null }, "2026-10-12"),
    ).toBe("");
  });

  it("CLASS_PACK → sin fecha (vence por consumo)", () => {
    expect(
      suggestedEndsAt({ type: "CLASS_PACK", periodDays: null }, "2026-10-12"),
    ).toBe("");
  });

  it("cruce de año en QUARTERLY (noviembre → febrero)", () => {
    expect(
      suggestedEndsAt(
        { type: "QUARTERLY", periodDays: null },
        "2026-11-15",
      ),
    ).toBe("2027-02-15");
  });
});
