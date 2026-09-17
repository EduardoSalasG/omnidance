import { describe, it, expect } from "vitest";
import {
  SessionsService,
  SessionDomainError,
  PAIR_COOLDOWN_MS,
  INVITE_GRACE_MS,
  type SessionLike,
} from "./sessions.service";

const svc = new SessionsService();
const now = new Date("2026-03-01T23:30:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);

const session = (over: Partial<SessionLike> = {}): SessionLike => ({
  inviterId: "A",
  inviteeId: "B",
  status: "INVITED",
  scannedAt: now,
  ...over,
});

const code = (e: unknown) => (e as SessionDomainError).code;

describe("SessionsService.assertInvitable (cooldown de par ~4min)", () => {
  it("rechaza auto-invitación", () => {
    try {
      svc.assertInvitable("A", "A", null, now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("SELF_INVITE");
    }
  });

  it("permite invitar sin sesión previa del par", () => {
    expect(() => svc.assertInvitable("A", "B", null, now)).not.toThrow();
  });

  it("rechaza si la última sesión del par (INVITED) tiene <4min", () => {
    const last = session({ status: "INVITED", scannedAt: minutesAgo(2) });
    try {
      svc.assertInvitable("A", "B", last, now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("PAIR_COOLDOWN");
    }
  });

  it("rechaza si la última sesión del par (CONFIRMED) tiene <4min", () => {
    const last = session({ status: "CONFIRMED", scannedAt: minutesAgo(1) });
    try {
      svc.assertInvitable("B", "A", last, now); // dirección inversa, mismo par
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("PAIR_COOLDOWN");
    }
  });

  it("permite invitar si la última sesión del par tiene ≥4min", () => {
    const last = session({ status: "CONFIRMED", scannedAt: minutesAgo(4.5) });
    expect(() => svc.assertInvitable("A", "B", last, now)).not.toThrow();
  });

  it("ignora sesiones terminales recientes (DECLINED/DISCARDED/EXPIRED)", () => {
    for (const status of ["DECLINED", "DISCARDED", "EXPIRED"] as const) {
      const last = session({ status, scannedAt: minutesAgo(1) });
      expect(() => svc.assertInvitable("A", "B", last, now)).not.toThrow();
    }
  });
});

describe("SessionsService.effectiveStatus (expiración lazy +24h)", () => {
  it("INVITED reciente sigue INVITED", () => {
    expect(
      svc.effectiveStatus(session({ scannedAt: minutesAgo(60) }), now),
    ).toBe("INVITED");
  });

  it("INVITED con scannedAt >24h se expone como EXPIRED", () => {
    const old = new Date(now.getTime() - INVITE_GRACE_MS - 1);
    expect(
      svc.effectiveStatus(session({ scannedAt: old }), now),
    ).toBe("EXPIRED");
  });

  it("CONFIRMED nunca expira", () => {
    const old = new Date(now.getTime() - INVITE_GRACE_MS * 2);
    expect(
      svc.effectiveStatus(session({ status: "CONFIRMED", scannedAt: old }), now),
    ).toBe("CONFIRMED");
  });
});

describe("SessionsService.transition (confirm/decline/discard)", () => {
  it("invitee confirma → CONFIRMED con confirmedAt", () => {
    const r = svc.transition(session(), "B", "confirm", now);
    expect(r.status).toBe("CONFIRMED");
    expect(r.confirmedAt).toEqual(now);
  });

  it("inviter no puede confirmar → FORBIDDEN", () => {
    try {
      svc.transition(session(), "A", "confirm", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("FORBIDDEN");
    }
  });

  it("un tercero no puede confirmar → FORBIDDEN", () => {
    try {
      svc.transition(session(), "C", "confirm", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("FORBIDDEN");
    }
  });

  it("confirmar sesión ya CONFIRMED → INVALID_STATE", () => {
    try {
      svc.transition(session({ status: "CONFIRMED" }), "B", "confirm", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("INVALID_STATE");
    }
  });

  it("confirmar invitación expirada (>24h) → INVALID_STATE", () => {
    const old = new Date(now.getTime() - INVITE_GRACE_MS - 1);
    try {
      svc.transition(session({ scannedAt: old }), "B", "confirm", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("INVALID_STATE");
    }
  });

  it("invitee declina → DECLINED", () => {
    expect(svc.transition(session(), "B", "decline", now).status).toBe(
      "DECLINED",
    );
  });

  it("inviter no puede declinar → FORBIDDEN", () => {
    try {
      svc.transition(session(), "A", "decline", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("FORBIDDEN");
    }
  });

  it("inviter descarta su invitación → DISCARDED", () => {
    expect(svc.transition(session(), "A", "discard", now).status).toBe(
      "DISCARDED",
    );
  });

  it("invitee no puede descartar → FORBIDDEN", () => {
    try {
      svc.transition(session(), "B", "discard", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("FORBIDDEN");
    }
  });

  it("descartar sesión ya CONFIRMED → INVALID_STATE", () => {
    try {
      svc.transition(session({ status: "CONFIRMED" }), "A", "discard", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("INVALID_STATE");
    }
  });
});

describe("SessionsService.assertRateable", () => {
  it("participante de sesión CONFIRMED puede puntuar", () => {
    const s = session({ status: "CONFIRMED" });
    expect(() => svc.assertRateable(s, "A", now)).not.toThrow();
    expect(() => svc.assertRateable(s, "B", now)).not.toThrow();
  });

  it("no participante → FORBIDDEN", () => {
    try {
      svc.assertRateable(session({ status: "CONFIRMED" }), "C", now);
      expect.unreachable();
    } catch (e) {
      expect(code(e)).toBe("FORBIDDEN");
    }
  });

  it.each(["INVITED", "DECLINED", "DISCARDED", "EXPIRED"] as const)(
    "sesión %s no es punteable → INVALID_STATE",
    (status) => {
      try {
        svc.assertRateable(session({ status }), "A", now);
        expect.unreachable();
      } catch (e) {
        expect(code(e)).toBe("INVALID_STATE");
      }
    },
  );
});

describe("SessionsService.validateScore", () => {
  it.each([1, 2, 3, 4, 5])("acepta enteros 1-5 (%i)", (n) => {
    expect(svc.validateScore(n)).toBe(n);
  });

  it.each([0, 6, -1, 2.5, "3", null, undefined, NaN])(
    "rechaza %s → INVALID_SCORE",
    (v) => {
      try {
        svc.validateScore(v);
        expect.unreachable();
      } catch (e) {
        expect(code(e)).toBe("INVALID_SCORE");
      }
    },
  );
});

describe("constantes", () => {
  it("cooldown = 4 minutos", () => {
    expect(PAIR_COOLDOWN_MS).toBe(4 * 60 * 1000);
  });
});
