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
   *
   * Routing por moneda (spec stripe-gateway-payout-rail): con
   * `currency` el provider pedido gana si la soporta (o no declara
   * restricción); si no, gana el primer adaptador registrado que la
   * soporte - los que declaran `currencies` la contienen y los sin
   * declaración se toman como sin restricción (STRIPE global, STUB
   * dev). Si ninguno la soporta cae al default actual, que lanza su
   * propio error de moneda en createOrder como hoy.
   */
  resolve(
    name: string | null | undefined,
    currency?: string,
  ): PaymentGateway {
    const requested = (name ? this.get(name) : undefined) ?? this.default();
    if (!currency) return requested;
    const cur = currency.toUpperCase();
    if (supportsCurrency(requested, cur)) return requested;
    for (const a of this.byName.values()) {
      if (supportsCurrency(a, cur)) return a;
    }
    return requested;
  }

  names(): string[] {
    return [...this.byName.keys()];
  }
}

/**
 * ¿El adaptador soporta la moneda? `currencies` sin declarar = sin
 * restricción (soporta todo lo que su API acepte - así una orden USD
 * rutea a STRIPE o al stub de dev aunque no la listen explícitamente).
 * Exportada: la selección de provider de suscripciones por moneda
 * (spec multipais-currency) la usa para exigir soporte explícito.
 */
export function supportsCurrency(g: PaymentGateway, currency: string): boolean {
  return (
    g.currencies === undefined ||
    g.currencies.some((c) => c.toUpperCase() === currency)
  );
}
