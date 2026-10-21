import { SkeletonList, SkeletonText } from "@/components/ui";

// Carga de la landing de ciudad: hero + grupos de cards - skeleton
// con la misma estructura (estándar de carga percibida).
export default function CiudadLoading() {
  return (
    <main
      id="contenido"
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10 sm:py-14 lg:max-w-4xl"
    >
      <SkeletonText lines={2} className="max-w-sm" />
      <SkeletonList items={4} />
    </main>
  );
}
