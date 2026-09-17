export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-4xl font-bold">
        Omni<span className="text-neon">dance</span>
      </h1>
      <p className="text-night-700 text-center max-w-md text-white/60">
        La plataforma de la escena SBK. Nightlife + Academias.
      </p>
      <div className="flex gap-3">
        <a
          href="/eventos"
          className="rounded-xl bg-neon px-5 py-3 font-semibold text-night-950"
        >
          Ver eventos
        </a>
        <a
          href="/qr"
          className="rounded-xl border border-night-700 px-5 py-3 font-semibold"
        >
          Mi QR
        </a>
      </div>
    </main>
  );
}
