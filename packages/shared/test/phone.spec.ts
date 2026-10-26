import { describe, it, expect } from "vitest";
import {
  formatPhoneNational,
  InvalidPhoneError,
  normalizePhone,
  normalizePhoneOrNull,
  PHONE_COUNTRIES,
  phoneCountryOf,
} from "../src/phone";

// Matriz de formatos de normalizePhone (spec multipais-phone P1):
// nacional con país por defecto, E.164 con "+" (override del default),
// inválidos → InvalidPhoneError, vacío → null.

describe("normalizePhone", () => {
  it("formato nacional CL → E.164 + CL derivado", () => {
    expect(normalizePhone("9 1234 5678", "CL")).toEqual({
      e164: "+56912345678",
      countryCode: "CL",
    });
    expect(normalizePhone("912345678", "CL")).toEqual({
      e164: "+56912345678",
      countryCode: "CL",
    });
  });

  it("prefijo 56 sin '+' → mismo E.164", () => {
    expect(normalizePhone("56 9 1234 5678", "CL")).toEqual({
      e164: "+56912345678",
      countryCode: "CL",
    });
  });

  it("'+' inicial parsea E.164 e ignora el defaultCountry", () => {
    expect(normalizePhone("+1 415 555 2671", "CL")).toEqual({
      e164: "+14155552671",
      countryCode: "US",
    });
    expect(normalizePhone("+52 55 1234 5678", "CL")).toEqual({
      e164: "+525512345678",
      countryCode: "MX",
    });
    expect(normalizePhone("+34612345678", "CL")).toEqual({
      e164: "+34612345678",
      countryCode: "ES",
    });
  });

  it("nacional de otro país con su defaultCountry", () => {
    expect(normalizePhone("11 5555 1234", "AR")).toEqual({
      e164: "+541155551234",
      countryCode: "AR",
    });
  });

  it.each(["123", "abc", "+562212345678", "11 5555 1234"])(
    "inválido %j → InvalidPhoneError",
    (raw) => {
      // "11 5555 1234" con CL parsea pero no es válido para CL.
      expect(() => normalizePhone(raw, "CL")).toThrow(InvalidPhoneError);
    },
  );

  it("país default no soportado → InvalidPhoneError", () => {
    expect(() => normalizePhone("912345678", "XX")).toThrow(InvalidPhoneError);
  });

  it.each(["", "   ", null, undefined])("vacío %j → null", (raw) => {
    expect(normalizePhone(raw, "CL")).toBeNull();
  });

  it("defaultCountry tolera minúsculas y espacios", () => {
    expect(normalizePhone("912345678", " cl ")?.countryCode).toBe("CL");
  });
});

describe("normalizePhoneOrNull", () => {
  it("válido → normaliza igual que normalizePhone", () => {
    expect(normalizePhoneOrNull("9 1234 5678", "CL")).toEqual({
      e164: "+56912345678",
      countryCode: "CL",
    });
    expect(normalizePhoneOrNull("+34612345678", "CL")).toEqual({
      e164: "+34612345678",
      countryCode: "ES",
    });
  });

  it("inválido o vacío → null sin lanzar (fallback del caller)", () => {
    expect(normalizePhoneOrNull("abc", "CL")).toBeNull();
    expect(normalizePhoneOrNull("+56900pend1", "CL")).toBeNull();
    expect(normalizePhoneOrNull(null, "CL")).toBeNull();
    expect(normalizePhoneOrNull("", "CL")).toBeNull();
  });
});

describe("phoneCountryOf", () => {
  it("deriva el país de un '+' aunque el número sea inválido", () => {
    expect(phoneCountryOf("+34612345", "CL")).toBe("ES");
    expect(phoneCountryOf("+56912345678", "CL")).toBe("CL");
  });

  it("sin '+' o inderivable → fallback", () => {
    expect(phoneCountryOf("912345678", "CL")).toBe("CL");
    expect(phoneCountryOf("+5", "CL")).toBe("CL");
    expect(phoneCountryOf("+56912345678")).toBe("CL");
    expect(phoneCountryOf("912345678")).toBeNull();
  });
});

describe("formatPhoneNational", () => {
  it("E.164 → formato nacional legible; texto crudo si no parsea", () => {
    // Los móviles CL no llevan separador en formato nacional (a
    // diferencia de los fijos, que sí salen agrupados).
    expect(formatPhoneNational("+56912345678")).toBe("912345678");
    expect(formatPhoneNational("912345678")).toBe("912345678");
    expect(formatPhoneNational(null)).toBe("");
  });
});

describe("PHONE_COUNTRIES", () => {
  it("catálogo de libphonenumber con dial codes", () => {
    expect(PHONE_COUNTRIES.length).toBeGreaterThan(200);
    expect(PHONE_COUNTRIES).toContainEqual({ code: "CL", dialCode: "+56" });
  });
});
