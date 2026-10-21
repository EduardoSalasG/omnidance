import { SkeletonList, SkeletonText } from "@/components/ui";

// Carga del directorio: el layout es conocido (título + filas), así que
// skeleton anticipado - nunca spinner desnudo (estándar de carga
// percibida). .page-loading difiere la aparición 200ms.
export default function CiudadesLoading() {
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
