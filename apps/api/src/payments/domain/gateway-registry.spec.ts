import { describe, expect, it } from "vitest";
import { GatewayRegistry } from "./gateway-registry";
import type { PaymentGateway } from "./ports";

const fake = (name: string, currencies?: string[]): PaymentGateway => ({
  name,
  currencies,
  createOrder: async () => ({ paymentUrl: "u", gatewayRef: "g" }),
  verifyWebhook: async () => ({ refId: "r", status: "PAID" }),
});

describe("GatewayRegistry", () => {
  it("get devuelve el adaptador por nombre (case-insensitive)", () => {
    const reg = new GatewayRegistry([fake("FLOW"), fake("MERCADOPAGO")], "FLOW");
    expect(reg.get("FLOW")?.name).toBe("FLOW");
    expect(reg.get("mercadopago")?.name).toBe("MERCADOPAGO");
  });

  it("get devuelve undefined para provider no registrado", () => {
    const reg = new GatewayRegistry([fake("FLOW")], "FLOW");
    expect(reg.get("FINTOC")).toBeUndefined();
    expect(reg.get("")).toBeUndefined();
  });

  it("default devuelve el adaptador configurado como default", () => {
    const reg = new GatewayRegistry([fake("STUB"), fake("FLOW")], "FLOW");
    expect(reg.default().name).toBe("FLOW");
  });

  it("default cae al único registrado si el nombre default no está", () => {
    const reg = new GatewayRegistry([fake("STUB")], "FLOW");
    expect(reg.default().name).toBe("STUB");
  });

  it("resolve: usa el provider pedido si existe, si no el default", () => {
    const reg = new GatewayRegistry([fake("STUB"), fake("FLOW")], "FLOW");
    expect(reg.resolve("MERCADOPAGO").name).toBe("FLOW"); // no registrado → default
    expect(reg.resolve("FLOW").name).toBe("FLOW");
    expect(reg.resolve(null).name).toBe("FLOW");
    expect(reg.resolve(undefined).name).toBe("FLOW");
  });

  it("names lista los providers registrados", () => {
    const reg = new GatewayRegistry([fake("STUB"), fake("FLOW")], "FLOW");
    expect(reg.names()).toEqual(["STUB", "FLOW"]);
  });

  // ─── Routing por moneda (spec stripe-gateway-payout-rail) ───

  it("resolve con moneda: el provider pedido gana si la soporta", () => {
    const reg = new GatewayRegistry(
      [fake("FLOW", ["CLP"]), fake("STRIPE")],
      "FLOW",
    );
    expect(reg.resolve("FLOW", "CLP").name).toBe("FLOW");
    // Sin restricción declarada (undefined) también gana lo que pida.
    expect(reg.resolve("STRIPE", "USD").name).toBe("STRIPE");
  });

  it("resolve con moneda: pedido que no la soporta cae al primero que sí", () => {
    const reg = new GatewayRegistry(
      [fake("FLOW", ["CLP"]), fake("STRIPE")],
      "FLOW",
    );
    // Default FLOW (CLP-only) + orden USD → STRIPE (sin restricción).
    expect(reg.resolve("FLOW", "USD").name).toBe("STRIPE");
    expect(reg.resolve("FLOW", "usd").name).toBe("STRIPE"); // case-insensitive
    // Adaptador que la declara explícitamente también calza.
    const reg2 = new GatewayRegistry(
      [fake("FLOW", ["CLP"]), fake("MERCADOPAGO", ["CLP", "USD"])],
      "FLOW",
    );
    expect(reg2.resolve("FLOW", "USD").name).toBe("MERCADOPAGO");
  });

  it("resolve con moneda: sin soporte registrado conserva el default actual", () => {
    const reg = new GatewayRegistry(
      [fake("FLOW", ["CLP"]), fake("FINTOC", ["CLP", "MXN"])],
      "FLOW",
    );
    // Nadie soporta EUR → el pedido (default) decide en createOrder.
    expect(reg.resolve("FLOW", "EUR").name).toBe("FLOW");
    // Provider pedido que no está registrado → default + routing.
    expect(reg.resolve("NOPE", "MXN").name).toBe("FINTOC");
  });

  it("resolve sin moneda mantiene el comportamiento de 1 arg", () => {
    const reg = new GatewayRegistry(
      [fake("FLOW", ["CLP"]), fake("STRIPE")],
      "FLOW",
    );
    expect(reg.resolve("FLOW").name).toBe("FLOW");
    expect(reg.resolve(null).name).toBe("FLOW");
    expect(reg.resolve("NOPE").name).toBe("FLOW");
  });
});
