// Nivel como medidor visual: 4 barras ascendentes fijas, pintadas
// `order+1` según el catálogo (Iniciación=1 … Avanzado=4) y el resto
// en gris — se lee como progreso, no como conteo suelto. El nombre
// va en aria-label + title.
export function LevelBars({ order, name }: { order: number; name: string }) {
  const filled = Math.min(Math.max(order + 1, 1), 4);
  const color =
    filled <= 1
      ? "bg-neon"
      : filled === 2
        ? "bg-amber-300"
        : filled === 3
          ? "bg-orange-400"
          : "bg-red-400";
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className="flex items-end gap-0.5"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-1 rounded-[1px] ${i < filled ? color : "bg-white/15"}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}
