"use client";

import { SkeletonList } from "@/components/ui";
import { useFeatures } from "@/lib/features-context";

/**
 * Gate client-side por flag de funcionalidad (spec admin "Modelo de
 * flags de funcionalidad"): mientras el mapa público GET /features
 * resuelve muestra skeleton; con el flag OFF o ausente (fail-closed,
 * mismo criterio que el gate server-side) muestra el estado "módulo
 * desactivado"; ON → children. El copy del estado lo pasa el caller
 * por `disabled` (i18n local de cada superficie - patrón de
 * `mi-viaje` y `/admin/ciudades`, que lo hacen inline por ser páginas
 * únicas).
 */
export function FeatureFlagGate({
  flag,
  disabled,
  children,
}: {
  /** Key del flag en el catálogo (p.ej. "academy_videos"). */
  flag: string;
  /** Copy del estado "módulo desactivado". */
  disabled: string;
  children: React.ReactNode;
}) {
  const { flags, loading } = useFeatures();

  if (loading) return <SkeletonList items={3} lines={1} />;
  if (flags[flag] !== true) {
    return <p className="text-sm text-ink/60">{disabled}</p>;
  }
  return <>{children}</>;
}
