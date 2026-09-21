// Mini barra de mezcla: la proporción de estilos que suena en la
// noche, segmentada por color (misma paleta que dots/texto de género).
// El ciclo llega como bloques [{genre, songs}] que se repiten — se
// agregan por género conservando el orden de primera aparición en el
// ciclo (el orden en que el DJ los tira).
//
// El div es role="img" con aria-label "Salsa 50% · Bachata 33% ·
// Timba 17%" — la barra es decorativa, el dato lo lleva el label.

export type GenreMixBlock = { genre: string; songs: number };

const MIX_COLOR: Record<string, string> = {
  SALSA: "bg-orange-500",
  BACHATA: "bg-fuchsia-400",
  CUBANO: "bg-amber-400",
};

export function aggregateMix(mix: GenreMixBlock[]) {
  const totals = new Map<string, number>();
  for (const b of mix) {
    totals.set(b.genre, (totals.get(b.genre) ?? 0) + b.songs);
  }
  const total = [...totals.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  return [...totals.entries()].map(([genre, n]) => ({
    genre,
    pct: (n / total) * 100,
  }));
}

export function GenreMixBar({
  mix,
  labels,
  className = "",
}: {
  mix: GenreMixBlock[];
  labels: Record<string, string>;
  className?: string;
}) {
  const segs = aggregateMix(mix);
  if (segs.length === 0) return null;
  const ariaLabel = segs
    .map((s) => `${labels[s.genre] ?? s.genre} ${Math.round(s.pct)}%`)
    .join(" · ");
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`flex h-1 w-full overflow-hidden rounded-full bg-white/10 ${className}`}
    >
      {segs.map((s) => (
        <span
          key={s.genre}
          className={MIX_COLOR[s.genre] ?? "bg-white/30"}
          style={{ width: `${s.pct}%` }}
        />
      ))}
    </div>
  );
}
