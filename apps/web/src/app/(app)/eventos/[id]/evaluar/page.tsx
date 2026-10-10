import { notFound } from "next/navigation";
import { SurveyForm } from "@/components/events/survey-form";
import { SERVER_API_URL } from "@/lib/server-api";

// Encuesta post-social: el server resuelve el nombre del evento para el
// título (GET /events/:id es público) y el form es isla client - mismo
// split server+island que el detalle del evento.
export const dynamic = "force-dynamic";

const API_URL = SERVER_API_URL;

async function getEventName(id: string): Promise<string | null> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    cache: "no-store",
  }).catch(() => null);
  if (res?.status === 404) notFound();
  if (!res || !res.ok) return null; // el título cae al genérico
  return ((await res.json()) as { name: string }).name;
}

export default async function EvaluarPage({
  params,
}: {
  params: { id: string };
}) {
  const name = await getEventName(params.id);
  return <SurveyForm eventId={params.id} eventName={name} />;
}
