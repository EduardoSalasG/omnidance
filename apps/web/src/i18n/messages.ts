import base from "../../messages/es-CL.json";
import academyExtras from "./parts/academyExtras.json";
import admin from "./parts/admin.json";
import analytics from "./parts/analytics.json";
import claim from "./parts/claim.json";
import classes from "./parts/classes.json";
import common from "./parts/common.json";
import consumer from "./parts/consumer.json";
import crm from "./parts/crm.json";
import dj from "./parts/dj.json";
import landing from "./parts/landing.json";
import locales from "./parts/locales.json";
import membershipCheckout from "./parts/membershipCheckout.json";
import payments from "./parts/payments.json";
import producer from "./parts/producer.json";
import profile from "./parts/profile.json";
import realtime from "./parts/realtime.json";
import subscriptions from "./parts/subscriptions.json";
import support from "./parts/support.json";
import tours from "./parts/tours.json";
import venue from "./parts/venue.json";

type Dict = Record<string, unknown>;

// messages/es-CL.json es la base; los namespaces nuevos viven en parts/*.json
// y se mezclan aquí para no inflar el archivo monolítico. El merge es por
// nivel para que un part que toque un namespace existente (p.ej. landing)
// no pise las claves de la base.
function merge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] =
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      prev !== null &&
      typeof prev === "object" &&
      !Array.isArray(prev)
        ? merge(prev as Dict, v as Dict)
        : v;
  }
  return out;
}

const parts = [
  academyExtras,
  admin,
  analytics,
  claim,
  classes,
  common,
  consumer,
  crm,
  dj,
  landing,
  locales,
  membershipCheckout,
  payments,
  producer,
  profile,
  realtime,
  subscriptions,
  support,
  tours,
  venue,
] as Dict[];

/** Diccionario completo: base + parts. Compartido por request.ts y layout. */
export const messages = parts.reduce<Dict>(
  (acc, p) => merge(acc, p),
  { ...base },
);
