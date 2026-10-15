export type Dict = Record<string, unknown>;

// Merge por nivel: un part que toca un namespace existente (p.ej.
// landing) no pisa las claves del resto - combina sus sub-árboles.
export function mergeDict(a: Dict, b: Dict): Dict {
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
        ? mergeDict(prev as Dict, v as Dict)
        : v;
  }
  return out;
}

/** Deep-merge estático espejo de mergeDict: B sobrescribe en hojas,
    combina en objetos. Da a los catálogos por locale el tipo exacto
    del JSON (los call sites conservan autocompletado + safety). */
export type DM<A, B> = A extends Record<string, unknown>
  ? B extends Record<string, unknown>
    ? {
        [K in keyof A | keyof B]: K extends keyof B
          ? K extends keyof A
            ? A[K] extends Record<string, unknown>
              ? B[K] extends Record<string, unknown>
                ? DM<A[K], B[K]>
                : B[K]
              : B[K]
            : B[K]
          : K extends keyof A
            ? A[K]
            : never;
      }
    : B
  : B;
