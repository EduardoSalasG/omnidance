import { describe, expect, it } from "vitest";
import {
  decodeClassRef,
  decodeMembershipRef,
  decodePrivateRef,
  decodeSeriesPassRef,
  decodeTicketOrderRef,
  encodeClassRef,
  encodeMembershipRef,
  encodePrivateRef,
  encodeSeriesPassRef,
  encodeTicketOrderRef,
} from "./order-ref";

// cuid de Prisma real = 25 chars - el caso que Flow rechazó con 400.
const CUID = "cmu62tr86001lyo423gke8z9l";

describe("order-ref cabe en commerceOrder de Flow (45)", () => {
  it("ticket con eventId cuid", () => {
    expect(encodeTicketOrderRef(CUID).length).toBeLessThanOrEqual(45);
  });

  it("series pass con seriesId cuid + mes", () => {
    expect(encodeSeriesPassRef(CUID, "2026-11").length).toBeLessThanOrEqual(
      45,
    );
  });

  it("membership, class y private con id cuid", () => {
    expect(encodeMembershipRef(CUID).length).toBeLessThanOrEqual(45);
    expect(encodeClassRef(CUID).length).toBeLessThanOrEqual(45);
    expect(encodePrivateRef(CUID).length).toBeLessThanOrEqual(45);
  });
});

describe("decode round-trip del formato corto", () => {
  it("ticket conserva eventId y uid; codeId vive en la columna", () => {
    const ref = encodeTicketOrderRef(CUID);
    const d = decodeTicketOrderRef(ref);
    expect(d).toEqual({ eventId: CUID, codeId: null, uid: ref.split("_")[2] });
  });

  it("series pass conserva seriesId y month", () => {
    const d = decodeSeriesPassRef(encodeSeriesPassRef(CUID, "2026-11"));
    expect(d?.seriesId).toBe(CUID);
    expect(d?.month).toBe("2026-11");
  });

  it("membership, class y private conservan su id", () => {
    expect(decodeMembershipRef(encodeMembershipRef(CUID))?.planId).toBe(CUID);
    expect(decodeClassRef(encodeClassRef(CUID))?.classId).toBe(CUID);
    expect(decodePrivateRef(encodePrivateRef(CUID))?.academyId).toBe(CUID);
  });
});

describe("compat legacy", () => {
  it("ticket legacy tkt_<event>_<code>_<uid> decodifica el code", () => {
    const d = decodeTicketOrderRef("tkt_evt-1_code-9_abc-def");
    expect(d).toEqual({ eventId: "evt-1", codeId: "code-9", uid: "abc-def" });
  });

  it("ticket legacy sin code tkt_<event>__<uid> decodifica codeId null", () => {
    const d = decodeTicketOrderRef("tkt_evt-1__abc-def");
    expect(d).toEqual({ eventId: "evt-1", codeId: null, uid: "abc-def" });
  });
});
