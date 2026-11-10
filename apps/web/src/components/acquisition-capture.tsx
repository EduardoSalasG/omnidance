"use client";

import { useEffect } from "react";
import { captureAcquisition } from "@/lib/acquisition";

/**
 * Captura first-touch de la fuente de adquisición (spec
 * auth/acquisition-source): corre una vez al montar el grupo
 * (marketing) — cubre landings, login y legales. Renderiza nada.
 */
export function AcquisitionCapture() {
  useEffect(() => {
    captureAcquisition();
  }, []);
  return null;
}
