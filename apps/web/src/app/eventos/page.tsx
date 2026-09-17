import Link from "next/link";
import messages from "../../../messages/es-CL.json";
import { Badge, Card, EventDate, PriceTag } from "@/components/ui";

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
            <li key={e.id}>
              <Link href={`/eventos/${e.id}`} className="block rounded-2xl">
                <Card className="transition-colors transition-transform hover:border-neon/50 active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {e.series && (
                          <Badge variant="neon">{e.series.name}</Badge>
                        )}
                        {e.status === "LIVE" && (
                          <Badge variant="live">{t.live}</Badge>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold">{e.name}</h2>
                      <p className="text-sm text-white/60">
                        <EventDate start={e.startsAt} /> · {e.venue.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {e.presalePrice != null ? (
                        <>
                          <span className="block text-xs text-white/50">
                            {t.presale}
                          </span>
                          <PriceTag amount={e.presalePrice} />
                        </>
                      ) : (
                        <span className="text-sm text-white/60">{t.free}</span>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
