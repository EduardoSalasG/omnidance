// Fuente de adquisición en altas orgánicas (spec
// auth/acquisition-source, estrategia §7.5 - CAC por actor): el
// cliente declara lo que capturó en la primera landing; el servidor
// normaliza el canal. Referral INVITE/GIFT_TICKET cubre los canales
// con referrer - esto cubre el resto (orgánico/pagado/directo).
export interface AcquisitionInput {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPath?: string;
}

export interface ResolvedAcquisition {
  /** Canal normalizado: utm:<source> | ref:<host> | landing:<path> | direct. */
  source: string;
  /** Capture crudo tal como llegó (para drill-down). */
  detail: AcquisitionInput;
}

// Hosts propios: un referrer interno no es fuente de adquisición.
const OWN_HOST =
  /(^|\.)omnidance\.(cl|tech|dev)$|(^|\.)localhost(:\d+)?$|127\.0\.0\.1/;

const trim = (v: string | undefined, max = 200) => {
  const s = v?.trim().slice(0, max);
  return s && s.length > 0 ? s : undefined;
};

function referrerHost(referrer: string | undefined): string | undefined {
  const raw = trim(referrer, 500);
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return OWN_HOST.test(host) ? undefined : host;
  } catch {
    return undefined;
  }
}

/**
 * Deriva el canal con precedencia utm_source > referrer externo >
 * landingPath > direct. Devuelve undefined cuando el cliente no
 * declaró `acquisition` (token de invite, cliente viejo) - ahí las
 * columnas quedan null y la atribución sigue siendo Referral.
 */
export function resolveAcquisition(
  input: AcquisitionInput | undefined,
): ResolvedAcquisition | undefined {
  if (!input) return undefined;
  const detail: AcquisitionInput = {
    ...(trim(input.utmSource) ? { utmSource: trim(input.utmSource) } : {}),
    ...(trim(input.utmMedium) ? { utmMedium: trim(input.utmMedium) } : {}),
    ...(trim(input.utmCampaign)
      ? { utmCampaign: trim(input.utmCampaign) }
      : {}),
    ...(trim(input.utmContent)
      ? { utmContent: trim(input.utmContent) }
      : {}),
    ...(trim(input.utmTerm) ? { utmTerm: trim(input.utmTerm) } : {}),
    ...(trim(input.referrer, 500)
      ? { referrer: trim(input.referrer, 500) }
      : {}),
    ...(trim(input.landingPath, 300)
      ? { landingPath: trim(input.landingPath, 300) }
      : {}),
  };
  const source = detail.utmSource
    ? `utm:${detail.utmSource}`
    : referrerHost(input.referrer)
      ? `ref:${referrerHost(input.referrer)}`
      : detail.landingPath
        ? `landing:${detail.landingPath}`
        : "direct";
  return { source, detail };
}
