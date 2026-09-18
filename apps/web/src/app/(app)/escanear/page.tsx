"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Ruta legacy — las superficies QR viven unificadas en /qr. Redirect
// client-side (replace) mapeando ?event= a ?modo=escanear&event= para
// que el back no quede atrapado en la redirección.
function RedirectToQr() {
  const router = useRouter();
  const eventId = useSearchParams().get("event");

  useEffect(() => {
    router.replace(
      `/qr?modo=escanear${eventId ? `&event=${encodeURIComponent(eventId)}` : ""}`,
    );
  }, [router, eventId]);

  return <main className="min-h-dvh bg-night-950" aria-hidden="true" />;
}

export default function EscanearPage() {
  return (
    <Suspense
      fallback={<main className="min-h-dvh bg-night-950" aria-hidden="true" />}
    >
      <RedirectToQr />
    </Suspense>
  );
}
