import { redirect } from "next/navigation";

// /academia/horarios se eliminó: la parrilla vive dentro de cada clase
// (serie) en /academia/series. Redirect permanente para links viejos.
export default function AcademiaHorariosPage() {
  redirect("/academia/series");
}
