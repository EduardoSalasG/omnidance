import messages from "../../../messages/es-CL.json";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type EventListItem = {
  id: string;
  name: string;
  type: string;
  status: string;
  startsAt: string;
  endsAt: string;
  presalePrice: number | null;
  doorPrice: number | null;
  series: { name: string } | null;
  venue: { name: string; address: string | null };
};

const fmtDate = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const fmtPrice = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export default async function EventosPage() {
  const t = messages.events;
  const res = await fetch(`${API_URL}/api/events`, { cache: "no-store" });
  const events: EventListItem[] = res.ok ? await res.json() : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      {events.length === 0 ? (
        <p className="text-white/60">{t.empty}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {events.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-night-700 bg-night-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  {e.series && (
                    <span className="text-xs font-medium uppercase tracking-wide text-neon">
                      {e.series.name}
                    </span>
                  )}
                  <h2 className="text-lg font-semibold">{e.name}</h2>
                  <p className="text-sm text-white/60">
                    {fmtDate.format(new Date(e.startsAt))} · {e.venue.name}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {e.presalePrice != null ? (
                    <>
                      <span className="block text-xs text-white/50">
                        {t.presale}
                      </span>
                      <span className="font-semibold text-neon">
                        {fmtPrice.format(e.presalePrice)}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-white/60">{t.free}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
