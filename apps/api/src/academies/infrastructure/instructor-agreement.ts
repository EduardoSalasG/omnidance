import { BadRequestException } from "@nestjs/common";

/** Subtipos del acuerdo económico del instructor. */
export const PAY_TYPES = ["PER_CLASS", "MONTHLY", "COMMISSION"] as const;

export interface AgreementDto {
  payType?: string | null;
  payAmount?: number | null;
  payClasses?: number | null;
  commissionPct?: number | null;
}

/**
 * Normaliza la escritura del acuerdo económico del instructor (spec
 * instructor-commission-subtype). Un solo subtipo activo por fila:
 *
 * - PER_CLASS / MONTHLY → payAmount/payClasses; commissionPct=null.
 * - COMMISSION → commissionPct (0-100, % que la academia retiene por
 *   clase particular); payAmount/payClasses=null. commissionPct solo se
 *   escribe cuando el subtipo vigente es COMMISSION.
 * - null → sin acuerdo; todos los campos económicos en null.
 *
 * `current` = fila AcademyInstructor vigente (para PATCH parcial: pct
 * editable sin reenviar el subtipo). En create pasar null.
 */
export function agreementWrite(
  dto: AgreementDto,
  current?: { payType: string | null; commissionPct: number | null } | null,
): Record<string, unknown> {
  if (dto.commissionPct !== undefined && dto.commissionPct !== null) {
    if (
      !Number.isInteger(dto.commissionPct) ||
      dto.commissionPct < 0 ||
      dto.commissionPct > 100
    ) {
      throw new BadRequestException("commissionPct debe ser entero 0-100");
    }
  }
  const payType =
    dto.payType !== undefined ? dto.payType : (current?.payType ?? null);
  const data: Record<string, unknown> = {};
  if (dto.payType !== undefined) data.payType = payType;
  if (!payType) {
    // Sin acuerdo: todos los campos económicos en null.
    if (dto.payType !== undefined) {
      data.payAmount = null;
      data.payClasses = null;
      data.commissionPct = null;
    }
  } else if (payType === "COMMISSION") {
    // Tasa del acuerdo comisión: la enviada, la vigente o 0.
    if (dto.payType !== undefined || dto.commissionPct !== undefined) {
      data.commissionPct =
        dto.commissionPct ?? current?.commissionPct ?? 0;
      data.payAmount = null;
      data.payClasses = null;
    }
  } else {
    // Otro subtipo o sin acuerdo: la tasa de comisión no aplica.
    if (dto.payType !== undefined) data.commissionPct = null;
    if (dto.payAmount !== undefined)
      data.payAmount = payType ? dto.payAmount : null;
    if (dto.payClasses !== undefined)
      data.payClasses = payType === "MONTHLY" ? dto.payClasses : null;
    if (
      dto.commissionPct !== undefined &&
      current?.payType !== "COMMISSION" &&
      dto.payType === undefined
    ) {
      // pct enviado sin acuerdo COMMISSION: se ignora (null limpia).
      data.commissionPct = null;
    }
  }
  return data;
}

/**
 * Snapshot de la comisión a la lección (create/assign): solo cuando el
 * acuerdo del instructor es COMMISSION — el resto nace con 0 (las
 * lecciones legacy con >0 se liquidan igual por pay-commission).
 */
export function commissionSnapshot(instructor: {
  payType: string | null;
  commissionPct: number | null;
}): number {
  return instructor.payType === "COMMISSION"
    ? (instructor.commissionPct ?? 0)
    : 0;
}
