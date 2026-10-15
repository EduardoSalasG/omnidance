import type { useTranslations } from "next-intl";
import type { CrmRuleCondition, CrmSegment } from "./types";

type T = ReturnType<typeof useTranslations>;

/** Texto corto de una condición de regla ("score ≥ 60", "tag VIP"). */
export function conditionLabel(t: T, c: CrmRuleCondition): string {
  const field = t.has(`actorSegments.fields.${c.field}`)
    ? t(`actorSegments.fields.${c.field}`)
    : c.field;
  const op = t.has(`actorSegments.ops.${c.op}`)
    ? t(`actorSegments.ops.${c.op}`)
    : c.op;
  if (c.field === "tag") {
    return `${field} ${op} "${c.value}"`;
  }
  return `${field} ${op} ${c.value}`;
}

/** Resumen legible de las reglas de un segmento para listados/ficha. */
export function rulesLabel(t: T, seg: CrmSegment): string {
  const conds = (seg.rules?.conditions ?? []).map((c) =>
    conditionLabel(t, c),
  );
  const glue =
    seg.rules?.match === "any"
      ? ` ${t("actorSegments.or")} `
      : ` ${t("actorSegments.and")} `;
  return conds.join(glue);
}
