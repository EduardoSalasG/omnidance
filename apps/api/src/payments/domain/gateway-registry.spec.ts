import { describe, expect, it } from "vitest";
import { GatewayRegistry } from "./gateway-registry";
import type { PaymentGateway } from "./ports";

const fake = (name: string): PaymentGateway => ({
  name,
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
});
