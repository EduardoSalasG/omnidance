import { EventDetailContent } from "./event-detail-content";

// Ruta protegida /eventos/[id]: la misma superficie en modo completo;
// la variante anónima (landing pública /e/[id]) llama el mismo
// componente con anonymous=true.
export default function EventoDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ a?: string }>;
}) {
  return <EventDetailContent {...props} />;
}
