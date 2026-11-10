// Captura de fuente de adquisición orgánica (spec
// auth/acquisition-source): first-touch en localStorage - la primera
// landing visitada gana (CAC = canal que trajo a la persona). El form
// de registro/magic-link la adjunta al body; el servidor normaliza.
export interface AcquisitionCapture {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landingPath?: string;
  capturedAt?: string;
}

export const ACQUISITION_KEY = "omnidance:acq";

const UTM_KEYS: [keyof AcquisitionCapture, string][] = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmContent", "utm_content"],
  ["utmTerm", "utm_term"],
];

/**
 * Persiste la captura de la landing actual si no existe una previa
 * (first-touch). Devuelve la captura vigente (nueva o previa).
 */
export function captureAcquisition(): AcquisitionCapture | null {
  if (typeof window === "undefined") return null;
  const prev = readAcquisition();
  if (prev) return prev;
  const params = new URLSearchParams(window.location.search);
  const cap: AcquisitionCapture = {
    landingPath: window.location.pathname,
    capturedAt: new Date().toISOString(),
  };
  for (const [field, param] of UTM_KEYS) {
    const v = params.get(param)?.trim();
    if (v) cap[field] = v.slice(0, 200);
  }
  const ref = document.referrer?.trim();
  if (ref) cap.referrer = ref.slice(0, 500);
  try {
    window.localStorage.setItem(ACQUISITION_KEY, JSON.stringify(cap));
    return cap;
  } catch {
    // Storage bloqueado (modo privado estricto): el alta sale sin
    // acquisition y queda untracked - nunca rompe el flujo.
    return null;
  }
}

/** La captura persistida, lista para adjuntar al body del alta. */
export function readAcquisition(): AcquisitionCapture | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACQUISITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AcquisitionCapture;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
