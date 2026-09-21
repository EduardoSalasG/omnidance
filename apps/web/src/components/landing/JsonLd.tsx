const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export type JsonLdEvent = {
  id: string;
  name: string;
  startsAt: string;
  venue: { name: string } | null;
};

/**
 * Datos estructurados schema.org de la landing: Organization + WebSite
 * siempre; ItemList de DanceEvent solo con los eventos reales del strip
 * (sin inventar venue cuando el dato no viene).
 */
export function JsonLd({ events }: { events: JsonLdEvent[] }) {
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Organization",
      "@id": `${WEB_URL}/#organization`,
      name: "Omnidance",
      url: WEB_URL,
      description:
        "Sociales, entradas, academias y clases de la comunidad salsera y bachatera de Chile en una sola app.",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${WEB_URL}/#website`,
      name: "Omnidance",
      url: WEB_URL,
      inLanguage: "es-CL",
      publisher: { "@id": `${WEB_URL}/#organization` },
    },
  ];

  if (events.length > 0) {
    graph.push({
      "@type": "ItemList",
      itemListElement: events.map((event, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "DanceEvent",
          name: event.name,
          startDate: event.startsAt,
          url: `${WEB_URL}/eventos/${event.id}`,
          ...(event.venue?.name
            ? { location: { "@type": "Place", name: event.venue.name } }
            : {}),
        },
      })),
    });
  }

  // Escapar "<" evita que un nombre de evento pueda cerrar el <script>.
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  }).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
