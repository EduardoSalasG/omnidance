import type { PaymentGateway } from "./ports";

// Registro de adaptadores por proveedor (spec
// gateway-port-normalization): Payment.gateway persiste el proveedor
// que creó la orden; el webhook :provider y cualquier confirmación
// resuelven el adaptador correcto por nombre - nunca por posición ni
// por el default.
export const PAYMENT_GATEWAYS = "PAYMENT_GATEWAYS";

export class GatewayRegistry {
  private readonly byName = new Map<string, PaymentGateway>();

  constructor(
    adapters: PaymentGateway[],
    private readonly defaultName: string,
  ) {
    for (const a of adapters) this.byName.set(a.name.toUpperCase(), a);
  }

  /** Adaptador por nombre de proveedor; undefined si no está registrado. */
  get(name: string): PaymentGateway | undefined {
    return this.byName.get(name.toUpperCase());
  }

  /**
   * El adaptador default (defaultName). Si ese provider no está
   * registrado (p.ej. param dice FLOW pero no hay credenciales) cae al
   * único registrado - en dev eso es el stub.
   */
  default(): PaymentGateway {
    const d = this.byName.get(this.defaultName.toUpperCase());
    if (d) return d;
    const only = [...this.byName.values()];
    if (!only.length) {
      throw new Error("GatewayRegistry: ningún adaptador registrado");
    }
    return only[0];
  }

  /**
   * Resuelve el provider pedido, cayendo al default si no está
   * registrado o viene vacío (selección por param
   * `payments.default_gateway` en checkout).
   */
  resolve(name: string | null | undefined): PaymentGateway {
    return (name ? this.get(name) : undefined) ?? this.default();
  }

  names(): string[] {
    return [...this.byName.keys()];
  }
}
