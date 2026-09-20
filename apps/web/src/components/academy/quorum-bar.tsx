// Barra de progreso del quórum (booked/quorum). Reutilizada por la lista
// "Mis clases" y el roster de la clase. Fill neon; role=progressbar para
// lectores de pantalla. quorum <= 0 = sin meta → no se renderiza (el
// caller decide si igual muestra el conteo).
export function QuorumBar({
  booked,
  quorum,
  className = "",
}: {
  booked: number;
  quorum: number;
  className?: string;
}) {
  if (quorum <= 0) return null;
  const pct = Math.min(100, Math.round((booked / quorum) * 100));
  return (
    <div
      role="progressbar"
      aria-valuenow={booked}
      aria-valuemin={0}
      aria-valuemax={quorum}
      className={`h-2 w-full overflow-hidden rounded-full bg-night-800 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] ${
          booked >= quorum ? "bg-neon" : "bg-neon/60"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
