import { describe, it, expect } from "vitest";
import {
  SocialDomainError,
  assertCanJoinWaitlist,
  assertPracticeInput,
  assertTripInput,
  canJoinWaitlist,
  nextWaitlistPosition,
  pickNextWaiting,
} from "./social.service";

describe("nextWaitlistPosition", () => {
  it("waitlist vacía → posición 1", () => {
    expect(nextWaitlistPosition([])).toBe(1);
  });

  it("devuelve max(posición) + 1 aunque haya huecos o desorden", () => {
    expect(
      nextWaitlistPosition([{ position: 3 }, { position: 1 }, { position: 7 }]),
    ).toBe(8);
  });

  it("cuenta posiciones de entradas EXPIRED (la posición nunca se reutiliza)", () => {
    expect(nextWaitlistPosition([{ position: 5 }, { position: 2 }])).toBe(6);
  });
});

describe("canJoinWaitlist / assertCanJoinWaitlist", () => {
  it("sin entrada previa y sin pase → puede entrar", () => {
    expect(canJoinWaitlist(null, false)).toBe(true);
    expect(() => assertCanJoinWaitlist(null, false)).not.toThrow();
  });

  it("entrada WAITING → no puede entrar (ALREADY_WAITING)", () => {
    expect(canJoinWaitlist({ status: "WAITING" }, false)).toBe(false);
    const err = catchErr(() =>
      assertCanJoinWaitlist({ status: "WAITING" }, false),
    );
    expect(err).toBeInstanceOf(SocialDomainError);
    expect(err.code).toBe("ALREADY_WAITING");
  });

  it("entrada PROMOTED → no puede re-entrar (sigue viva)", () => {
    expect(canJoinWaitlist({ status: "PROMOTED" }, false)).toBe(false);
    expect(
      catchErr(() => assertCanJoinWaitlist({ status: "PROMOTED" }, false)).code,
    ).toBe("ALREADY_WAITING");
  });

  it("entrada EXPIRED → puede re-ingresar con posición nueva", () => {
    expect(canJoinWaitlist({ status: "EXPIRED" }, false)).toBe(true);
    expect(() =>
      assertCanJoinWaitlist({ status: "EXPIRED" }, false),
    ).not.toThrow();
  });

  it("con ticket/pase activo → no puede entrar aunque no esté en la lista", () => {
    expect(canJoinWaitlist(null, true)).toBe(false);
    expect(catchErr(() => assertCanJoinWaitlist(null, true)).code).toBe(
      "HAS_ACTIVE_PASS",
    );
  });

  it("pase activo tiene prioridad de motivo sobre entrada EXPIRED", () => {
    expect(
      catchErr(() => assertCanJoinWaitlist({ status: "EXPIRED" }, true)).code,
    ).toBe("HAS_ACTIVE_PASS");
  });
});

describe("pickNextWaiting", () => {
  const e = (id: string, position: number, status: string) => ({
    id,
    position,
    status,
  });

  it("lista vacía → null", () => {
    expect(pickNextWaiting([])).toBeNull();
  });

  it("devuelve el WAITING de menor posición", () => {
    const next = pickNextWaiting([
      e("c", 3, "WAITING"),
      e("a", 1, "PROMOTED"),
      e("b", 2, "WAITING"),
      e("d", 4, "EXPIRED"),
    ]);
    expect(next?.id).toBe("b");
  });

  it("ignora PROMOTED/EXPIRED aunque tengan menor posición", () => {
    const next = pickNextWaiting([
      e("a", 1, "PROMOTED"),
      e("b", 5, "WAITING"),
    ]);
    expect(next?.id).toBe("b");
  });

  it("sin WAITING → null", () => {
    expect(
      pickNextWaiting([e("a", 1, "PROMOTED"), e("b", 2, "EXPIRED")]),
    ).toBeNull();
  });
});

describe("assertPracticeInput", () => {
  const base = {
    name: "Práctica de casino en el parque",
    startsAt: new Date("2030-06-01T18:00:00Z"),
    endsAt: new Date("2030-06-01T20:00:00Z"),
  };

  it("input válido sin capacidad → no lanza", () => {
    expect(() => assertPracticeInput(base)).not.toThrow();
  });

  it("input válido con capacidad > 0 → no lanza", () => {
    expect(() => assertPracticeInput({ ...base, capacity: 12 })).not.toThrow();
  });

  it("nombre vacío → INVALID_INPUT", () => {
    for (const name of ["", "   "]) {
      const err = catchErr(() => assertPracticeInput({ ...base, name }));
      expect(err).toBeInstanceOf(SocialDomainError);
      expect(err.code).toBe("INVALID_INPUT");
    }
  });

  it("startsAt >= endsAt → INVALID_INPUT", () => {
    expect(
      catchErr(() => assertPracticeInput({ ...base, startsAt: base.endsAt }))
        .code,
    ).toBe("INVALID_INPUT");
    expect(
      catchErr(() =>
        assertPracticeInput({
          ...base,
          endsAt: new Date("2030-06-01T17:00:00Z"),
        }),
      ).code,
    ).toBe("INVALID_INPUT");
  });

  it("fechas inválidas → INVALID_INPUT", () => {
    expect(
      catchErr(() =>
        assertPracticeInput({ ...base, startsAt: new Date("no-date") }),
      ).code,
    ).toBe("INVALID_INPUT");
  });

  it("capacidad 0, negativa o no entera → INVALID_INPUT", () => {
    for (const capacity of [0, -3, 2.5]) {
      expect(
        catchErr(() => assertPracticeInput({ ...base, capacity })).code,
      ).toBe("INVALID_INPUT");
    }
  });

  it("capacity null → válido (sin aforo declarado)", () => {
    expect(() =>
      assertPracticeInput({ ...base, capacity: null }),
    ).not.toThrow();
  });
});

describe("assertTripInput", () => {
  const base = {
    destination: "Valparaíso",
    startsAt: new Date("2030-09-10T00:00:00Z"),
    endsAt: new Date("2030-09-14T00:00:00Z"),
  };

  it("input válido → no lanza", () => {
    expect(() => assertTripInput(base)).not.toThrow();
  });

  it("destino vacío → INVALID_INPUT", () => {
    expect(
      catchErr(() => assertTripInput({ ...base, destination: "  " })).code,
    ).toBe("INVALID_INPUT");
  });

  it("startsAt >= endsAt → INVALID_INPUT", () => {
    expect(
      catchErr(() => assertTripInput({ ...base, endsAt: base.startsAt })).code,
    ).toBe("INVALID_INPUT");
  });
});

function catchErr(fn: () => void): SocialDomainError {
  try {
    fn();
  } catch (e) {
    return e as SocialDomainError;
  }
  throw new Error("expected function to throw");
}
