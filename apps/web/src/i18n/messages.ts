import base from "../../messages/es-CL.json";
import academyExtras from "./parts/academyExtras.json";
import admin from "./parts/admin.json";
import common from "./parts/common.json";
import consumer from "./parts/consumer.json";
import crm from "./parts/crm.json";
import landing from "./parts/landing.json";
import producer from "./parts/producer.json";
import realtime from "./parts/realtime.json";
import seo from "./parts/seo.json";
import dj from "./parts/dj.json";
import venue from "./parts/venue.json";
import support from "./parts/support.json";

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
  common,
  consumer,
  crm,
  landing,
  producer,
  realtime,
  seo,
  dj,
  venue,
  support,
] as Dict[];

/** Diccionario completo: base + parts. Compartido por request.ts y layout. */
export const messages = parts.reduce<Dict>(
  (acc, p) => merge(acc, p),
  { ...base },
);
