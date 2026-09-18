"use client";

import dynamic from "next/dynamic";

// three.js (~150KB gzip) viaja en un chunk separado que solo se descarga
// en el cliente tras la hidratación — la landing sigue siendo SSR y el
// LCP (el titular) nunca espera al canvas.
const SceneCanvas = dynamic(() => import("./SceneCanvas"), { ssr: false });

/** Campo de partículas decorativo detrás del hero. */
export function LandingScene() {
  return <SceneCanvas />;
}
