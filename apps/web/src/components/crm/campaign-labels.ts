import type { useTranslations } from "next-intl";
import type { CrmCampaign } from "./types";

type T = ReturnType<typeof useTranslations<"crm">>;

/** Resumen legible de la audiencia de una campaña (los criterios
 *  presentes se unen con " + " - misma semántica OR del service). */
export function audienceLabel(t: T, c: CrmCampaign): string {
  const parts: string[] = [];
  if (c.segment?.allStudents) parts.push(t("campaigns.allStudents"));
  if (c.segment?.enrollmentStatus?.length) {
    parts.push(
      c.segment.enrollmentStatus
        .map((s) =>
          t.has(`campaigns.enrollmentStatus.${s}`)
            ? t(`campaigns.enrollmentStatus.${s}`)
            : s,
        )
        .join(", "),
    );
  }
  if (c.segment?.planId) parts.push(t("campaigns.byPlan"));
  if (c.segment?.seriesId) parts.push(t("campaigns.bySeries"));
  if (c.segment?.segment) {
    parts.push(
      t.has(`segments.${c.segment.segment}`)
        ? t(`segments.${c.segment.segment}`)
        : c.segment.segment,
    );
  }
  if (c.segment?.tags?.length) parts.push(c.segment.tags.join(", "));
  if (c.segment?.personIds?.length) {
    parts.push(`${t("campaigns.pickPeople")} (${c.segment.personIds.length})`);
  }
  return parts.join(" + ") || t("campaigns.audienceAll");
}

/** Etiqueta de la acción: tipo + magnitud del descuento si aplica. */
export function actionLabel(t: T, c: CrmCampaign): string {
  if (c.action?.type === "DISCOUNT_CODE") {
    const off =
      c.action.percentOff != null
        ? `−${c.action.percentOff}%`
        : c.action.amountOff != null
          ? `−$${c.action.amountOff.toLocaleString("es-CL")}`
          : "";
    return `${t("campaigns.types.DISCOUNT_CODE")} ${off}`.trim();
  }
  return t("campaigns.types.NOTIFY");
}
