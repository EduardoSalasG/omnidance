"use client";

import { Scanner } from "@yudiel/react-qr-scanner";
import type {
  IDetectedBarcode,
  IScannerError,
} from "@yudiel/react-qr-scanner";

export type QrScannerProps = {
  onScan: (codes: IDetectedBarcode[]) => void;
  onError?: (error: IScannerError) => void;
  /** Congela el frame mientras se muestra feedback de la invitación. */
  paused?: boolean;
};

/**
 * Cámara a pantalla completa para escanear el QR de la pareja.
 * Marco guía de alto brillo (el local es oscuro) + antorcha disponible.
 * Se carga con next/dynamic ssr:false desde la página.
 */
export default function QrScanner({ onScan, onError, paused = false }: QrScannerProps) {
  return (
    <Scanner
      onScan={onScan}
      onError={onError}
      paused={paused}
      formats={["qr_code"]}
      sound={false}
      components={{ finder: false, torch: true, onOff: false, zoom: false }}
      styles={{
        container: {
          width: "100%",
          height: "100%",
          aspectRatio: "auto",
          position: "relative",
          overflow: "hidden",
        },
        video: { width: "100%", height: "100%", objectFit: "cover" },
      }}
    >
      {/* Marco guía de alto brillo — se ve incluso con poca luz */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-60 w-60 rounded-3xl border-4 border-neon shadow-[0_0_48px_rgba(224,64,251,0.5)]" />
      </div>
    </Scanner>
  );
}
